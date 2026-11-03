/**
 * Florescer · API (Google Apps Script)
 *
 * - Guarda os dados da plataforma em um arquivo no Google Drive da nutricionista.
 * - Mostra os horários livres para o agendamento online (cruzando com a Google Agenda).
 * - Cria o evento na Google Agenda com convite para a paciente e envia a confirmação por e-mail.
 * - Faz backup diário automático dos dados (mantém os últimos 30).
 *
 * Instalação: veja GUIA-INSTALACAO.md no repositório.
 */
const TZ = 'America/Sao_Paulo';
const P = PropertiesService.getScriptProperties();

const AGENDA_PADRAO = {
  ativo: true, dias: ['1', '2', '3', '4', '5'], inicio: '09:00', fim: '18:00', pausaIni: '12:00', pausaFim: '13:00',
  duracao: 60, intervalo: 15, antecedencia: 24, janela: 30,
  tipos: ['Primeira consulta', 'Retorno'], modalidades: ['Online', 'Presencial'], endereco: '', mensagem: ''
};

/* ============ INSTALAÇÃO (rodar uma vez pelo editor) ============ */
function instalar() {
  if (!P.getProperty('STATE_ID')) {
    const pasta = DriveApp.createFolder('Florescer — Dados da plataforma');
    const backups = pasta.createFolder('Backups');
    P.setProperties({
      FOLDER_ID: pasta.getId(),
      BACKUP_ID: backups.getId(),
      STATE_ID: pasta.createFile('dados.json', '{}', MimeType.PLAIN_TEXT).getId(),
      BOOK_ID: pasta.createFile('agendamentos-online.json', '[]', MimeType.PLAIN_TEXT).getId(),
      VERSION: '0'
    });
  }
  if (!P.getProperty('ADMIN_KEY')) P.setProperty('ADMIN_KEY', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupDiario').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).inTimezone(TZ).create();
  CalendarApp.getDefaultCalendar().getName();
  MailApp.getRemainingDailyQuota();
  planilha();
  Logger.log('✅ Instalação concluída. Os dados ficam na pasta "Florescer — Dados da plataforma" do seu Google Drive.');
  Logger.log('📊 Planilha: ' + planilha().getUrl());
  Logger.log('🔑 SUA CHAVE DE ACESSO (copie e guarde em segredo): ' + P.getProperty('ADMIN_KEY'));
}
function mostrarChave() { Logger.log(P.getProperty('ADMIN_KEY')); }

/* ============ ROTEADOR ============ */
function doGet(e) { return responder(e.parameter || {}); }
function doPost(e) {
  let corpo = {};
  try { corpo = JSON.parse(e.postData.contents); } catch (x) {}
  return responder(Object.assign({}, e.parameter, corpo));
}
function responder(p) {
  let out;
  try {
    if (!P.getProperty('STATE_ID')) throw new Error('API não instalada: rode a função "instalar" no editor.');
    switch (p.action) {
      case 'config': out = configPublica(); break;
      case 'slots': out = horarios(); break;
      case 'book': out = agendar(p); break;
      case 'ping': exigirChave(p); out = { ok: true }; break;
      case 'load': exigirChave(p); out = carregar(); break;
      case 'save': exigirChave(p); out = salvar(p); break;
      default: out = { ok: false, error: 'Ação inválida' };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function exigirChave(p) {
  if (!p.key || p.key !== P.getProperty('ADMIN_KEY')) throw new Error('Chave de acesso inválida.');
}

/* ============ ARMAZENAMENTO ============ */
function lerJSON(prop, padrao) {
  try { return JSON.parse(DriveApp.getFileById(P.getProperty(prop)).getBlob().getDataAsString('UTF-8')); }
  catch (e) { return padrao; }
}
function gravarJSON(prop, obj) { DriveApp.getFileById(P.getProperty(prop)).setContent(JSON.stringify(obj)); }

function carregar() {
  let sheetUrl = '';
  try { sheetUrl = planilha().getUrl(); } catch (e) {}
  return { ok: true, state: lerJSON('STATE_ID', {}), version: +P.getProperty('VERSION'), bookings: lerJSON('BOOK_ID', []), sheetUrl: sheetUrl };
}
function salvar(p) {
  if (!p.state || !Array.isArray(p.state.pacientes)) throw new Error('Dados inválidos.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const v = +P.getProperty('VERSION');
    if (!p.force && +p.baseVersion !== v) return { ok: false, conflict: true, version: v };
    gravarJSON('STATE_ID', p.state);
    P.setProperty('VERSION', String(v + 1));
  } finally { lock.releaseLock(); }
  try { atualizarPlanilha(p.state); } catch (e) { console.error('Planilha: ' + e); }
  return { ok: true, version: +P.getProperty('VERSION') };
}
function contexto() {
  const st = lerJSON('STATE_ID', {});
  const s = st.settings || {};
  return { st, s, cfg: Object.assign({}, AGENDA_PADRAO, s.agendaOnline || {}) };
}

/* ============ AGENDAMENTO ONLINE ============ */
function configPublica() {
  const { s, cfg } = contexto();
  return {
    ok: true, clinica: s.clinica || 'Florescer', subtitulo: s.subtitulo || '', nutri: s.nutri || '', crn: s.crn || '',
    metodo: s.metodo || '', telefone: s.telefone || '', instagram: s.instagram || '',
    agenda: { ativo: !!cfg.ativo, tipos: cfg.tipos, modalidades: cfg.modalidades, duracao: +cfg.duracao, endereco: cfg.endereco }
  };
}
function horarios() {
  const { st, cfg } = contexto();
  if (!cfg.ativo) return { ok: true, ativo: false, dias: [] };
  return { ok: true, ativo: true, dias: livres(st, cfg) };
}

const toMin = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
const fmtHM = m => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
const em = (d, m) => Utilities.parseDate(d + ' ' + fmtHM(m), TZ, 'yyyy-MM-dd HH:mm');

function livres(st, cfg, soDia) {
  const agora = new Date();
  const dur = +cfg.duracao || 60, passo = dur + (+cfg.intervalo || 0);
  const minimo = new Date(agora.getTime() + (+cfg.antecedencia || 0) * 36e5);
  const nDias = Math.min(+cfg.janela || 30, 90);
  const fimJanela = new Date(agora.getTime() + (nDias + 1) * 864e5);
  // Compromissos da Google Agenda (exceto convites recusados) bloqueiam o horário
  const ocupado = CalendarApp.getDefaultCalendar().getEvents(agora, fimJanela)
    .filter(ev => ev.getMyStatus() !== CalendarApp.GuestStatus.NO)
    .map(ev => [ev.getStartTime().getTime(), ev.getEndTime().getTime()]);
  // Consultas lançadas manualmente na plataforma também bloqueiam
  (st.agenda || []).filter(a => a.status === 'Agendada' && a.data && a.hora).forEach(a => {
    const ini = em(a.data, toMin(a.hora)).getTime();
    ocupado.push([ini, ini + dur * 6e4]);
  });
  const dias = (cfg.dias || []).map(String);
  const out = [];
  for (let i = 0; i <= nDias; i++) {
    const ref = new Date(agora.getTime() + i * 864e5);
    const d = Utilities.formatDate(ref, TZ, 'yyyy-MM-dd');
    if (soDia && d !== soDia) continue;
    if (dias.indexOf(Utilities.formatDate(ref, TZ, 'u')) < 0) continue;
    const horas = [];
    for (let m = toMin(cfg.inicio); m + dur <= toMin(cfg.fim); m += passo) {
      if (cfg.pausaIni && cfg.pausaFim && m < toMin(cfg.pausaFim) && m + dur > toMin(cfg.pausaIni)) { m = toMin(cfg.pausaFim) - passo; continue; }
      const ini = em(d, m), fim = ini.getTime() + dur * 6e4;
      if (ini < minimo) continue;
      if (ocupado.some(([a, b]) => ini.getTime() < b && fim > a)) continue;
      horas.push(fmtHM(m));
    }
    if (horas.length) out.push({ data: d, horas });
  }
  return out;
}

function agendar(p) {
  const { st, s, cfg } = contexto();
  if (!cfg.ativo) throw new Error('O agendamento online está desativado no momento.');
  const nome = String(p.nome || '').trim().slice(0, 120);
  const email = String(p.email || '').trim().toLowerCase().slice(0, 120);
  const tel = String(p.telefone || '').trim().slice(0, 30);
  if (nome.length < 3) throw new Error('Informe seu nome completo.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if (tel.replace(/\D/g, '').length < 10) throw new Error('Informe um WhatsApp com DDD.');
  if (!p.consentimento) throw new Error('É preciso autorizar o uso dos dados para o agendamento.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data || '') || !/^\d{2}:\d{2}$/.test(p.hora || '')) throw new Error('Escolha data e horário.');
  const tipo = cfg.tipos.indexOf(p.tipo) >= 0 ? p.tipo : cfg.tipos[0];
  const modalidade = cfg.modalidades.indexOf(p.modalidade) >= 0 ? p.modalidade : cfg.modalidades[0];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const dia = livres(st, cfg, p.data)[0];
    if (!dia || dia.horas.indexOf(p.hora) < 0) throw new Error('Esse horário acabou de ser ocupado. Escolha outro, por favor.');
    const dur = +cfg.duracao || 60;
    const ini = em(p.data, toMin(p.hora)), fim = new Date(ini.getTime() + dur * 6e4);
    const titulo = tipo + ' · ' + nome;
    const local = modalidade === 'Presencial' ? (cfg.endereco || '') : '';
    const desc = [
      tipo + ' (' + modalidade + ') com ' + (s.nutri || 'a nutricionista'),
      '', 'Paciente: ' + nome, 'E-mail: ' + email, 'WhatsApp: ' + tel,
      p.nascimento ? 'Nascimento: ' + p.nascimento : '',
      p.obs ? 'Observações: ' + String(p.obs).slice(0, 1000) : '',
      '', 'Agendado pelo site.'
    ].filter((l, i, a) => l || a[i - 1]).join('\n');

    let eventId = '', meet = '';
    if (modalidade === 'Online' && typeof Calendar !== 'undefined') {
      // Serviço avançado "Google Calendar API" ativo: cria o link do Google Meet
      const ev = Calendar.Events.insert({
        summary: titulo, description: desc,
        start: { dateTime: ini.toISOString(), timeZone: TZ }, end: { dateTime: fim.toISOString(), timeZone: TZ },
        attendees: [{ email: email, displayName: nome }],
        conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      }, 'primary', { conferenceDataVersion: 1, sendUpdates: 'all' });
      eventId = ev.id;
      meet = ev.hangoutLink || '';
    } else {
      const ev = CalendarApp.getDefaultCalendar().createEvent(titulo, ini, fim, { description: desc, location: local, guests: email, sendInvites: true });
      eventId = ev.getId();
    }

    const b = {
      id: Utilities.getUuid(), criadoEm: new Date().toISOString(), nome: nome, email: email, telefone: tel,
      nascimento: p.nascimento || '', data: p.data, hora: p.hora, tipo: tipo, modalidade: modalidade,
      obs: String(p.obs || '').slice(0, 1000), eventId: eventId, meet: meet
    };
    const lista = lerJSON('BOOK_ID', []);
    lista.push(b);
    gravarJSON('BOOK_ID', lista);
    try { abaAgendamentos(planilha(), lista); } catch (e) { console.error('Planilha: ' + e); }

    try { emailConfirmacao(s, cfg, b, local); } catch (e) { console.error(e); }
    try { emailAviso(s, b); } catch (e) { console.error(e); }
    return { ok: true, agendamento: { data: b.data, hora: b.hora, tipo: tipo, modalidade: modalidade, meet: meet, local: local, duracao: dur } };
  } finally { lock.releaseLock(); }
}

/* ============ E-MAILS ============ */
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dataExtenso(d) {
  const [a, m, dia] = d.split('-').map(Number);
  const w = new Date(a, m - 1, dia).getDay();
  return SEMANA[w] + ', ' + dia + ' de ' + MESES[m - 1];
}
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function moldura(s, titulo, corpo) {
  return '<div style="background:#F3EEE6;padding:32px 12px;font-family:Helvetica,Arial,sans-serif;color:#1A1714">' +
    '<div style="max-width:560px;margin:0 auto;background:#FBF8F3;border:1px solid #E2D8CA">' +
    '<div style="background:#15120F;padding:28px;text-align:center">' +
    '<div style="font-family:Georgia,serif;color:#F1E9DC;font-size:20px;letter-spacing:6px;text-transform:uppercase">' + esc(s.clinica || 'Florescer') + '</div>' +
    '<div style="color:#B8925A;font-size:10px;letter-spacing:4px;text-transform:uppercase;margin-top:6px">' + esc(s.subtitulo || '') + '</div></div>' +
    '<div style="padding:32px 32px 12px"><h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 16px">' + titulo + '</h1>' + corpo + '</div>' +
    '<div style="padding:18px 32px 28px;color:#7B7166;font-size:12px;border-top:1px solid #E2D8CA">' + esc(s.nutri || '') + (s.crn ? ' · ' + esc(s.crn) : '') +
    (s.telefone ? '<br>WhatsApp: ' + esc(s.telefone) : '') + (s.instagram ? ' · ' + esc(s.instagram) : '') + '</div></div></div>';
}
function tabela(linhas) {
  return '<table style="width:100%;border-collapse:collapse;margin:8px 0 20px">' + linhas.map(([k, v]) =>
    '<tr><td style="padding:10px 0;border-bottom:1px solid #E2D8CA;color:#7B7166;font-size:11px;letter-spacing:2px;text-transform:uppercase;width:38%">' + k +
    '</td><td style="padding:10px 0;border-bottom:1px solid #E2D8CA;font-size:15px">' + v + '</td></tr>').join('') + '</table>';
}
function emailConfirmacao(s, cfg, b, local) {
  const quando = dataExtenso(b.data) + ' às ' + b.hora;
  const linhas = [['Consulta', esc(b.tipo)], ['Quando', esc(quando)], ['Duração', (+cfg.duracao || 60) + ' minutos'], ['Modalidade', esc(b.modalidade)]];
  if (b.meet) linhas.push(['Link da chamada', '<a href="' + esc(b.meet) + '" style="color:#A8834F">' + esc(b.meet) + '</a>']);
  else if (b.modalidade === 'Online') linhas.push(['Link da chamada', 'será enviado antes da consulta']);
  if (local) linhas.push(['Endereço', esc(local)]);
  const corpo = '<p style="font-size:15px;line-height:1.6">Olá, ' + esc(b.nome.split(' ')[0]) + '! Sua consulta está <b>confirmada</b>.</p>' + tabela(linhas) +
    '<p style="font-size:14px;line-height:1.6;color:#4a443e">O convite também foi enviado para a sua <b>Google Agenda</b>. Se precisar remarcar, responda este e-mail ou fale pelo WhatsApp.</p>' +
    (cfg.mensagem ? '<p style="font-size:14px;line-height:1.6;color:#4a443e;white-space:pre-wrap">' + esc(cfg.mensagem) + '</p>' : '');
  MailApp.sendEmail({
    to: b.email, subject: 'Consulta confirmada · ' + quando, name: s.clinica || 'Florescer',
    replyTo: Session.getEffectiveUser().getEmail(), htmlBody: moldura(s, 'Consulta <i style="color:#A8834F">confirmada</i>', corpo)
  });
}
function emailAviso(s, b) {
  const corpo = tabela([['Paciente', esc(b.nome)], ['Quando', esc(dataExtenso(b.data) + ' às ' + b.hora)], ['Consulta', esc(b.tipo + ' · ' + b.modalidade)],
    ['E-mail', esc(b.email)], ['WhatsApp', esc(b.telefone)], ['Observações', esc(b.obs || '—')]]) +
    '<p style="font-size:14px;color:#4a443e">O agendamento já está na sua Google Agenda e entra na plataforma na próxima vez que você abri-la.</p>';
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(), subject: 'Novo agendamento online · ' + b.nome, name: 'Florescer · Agenda',
    htmlBody: moldura(s, 'Novo <i style="color:#A8834F">agendamento</i>', corpo)
  });
}

/* ============ PLANILHA ESPELHO (Google Sheets, somente leitura) ============ */
const EXAMES = {
  amh: 'AMH', fsh: 'FSH', lh: 'LH', e2: 'Estradiol', prog: 'Progesterona', prl: 'Prolactina', testo: 'Testosterona',
  tsh: 'TSH', t4l: 'T4 livre', antitpo: 'Anti-TPO', glic: 'Glicemia', ins: 'Insulina', hba1c: 'HbA1c', pcr: 'PCR-us',
  vitd: 'Vitamina D', ferr: 'Ferritina', b12: 'B12', fol: 'Folato', hcy: 'Homocisteína', zn: 'Zinco',
  sp_conc: 'Esperma: concentração', sp_mot: 'Esperma: motilidade', sp_morf: 'Esperma: morfologia', sp_vol: 'Esperma: volume',
  sp_dna: 'Esperma: fragmentação DNA', p_vitd: 'Parceiro: vitamina D'
};
const N_PERGUNTAS_SCORE = 14;

function planilha() {
  const id = P.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('Florescer — Planilha (somente leitura)');
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(P.getProperty('FOLDER_ID')));
  P.setProperty('SHEET_ID', ss.getId());
  return ss;
}
function aba(ss, nome, cabecalho, linhas) {
  const sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  sh.clear();
  // Texto que começa com = + - @ viraria fórmula: grava como texto puro
  const dados = [cabecalho].concat(linhas).map(l => l.map(v => typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v));
  sh.getRange(1, 1, dados.length, cabecalho.length).setValues(dados);
  sh.getRange(1, 1, 1, cabecalho.length).setFontWeight('bold').setBackground('#15120F').setFontColor('#F1E9DC');
  sh.setFrozenRows(1);
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sh.protect().setWarningOnly(true).setDescription('Gerada pela plataforma Florescer. Edite os dados pela plataforma.');
  }
  return sh;
}
const brData = d => d ? String(d).split('-').reverse().join('/') : '';
const idade = n => { if (!n) return ''; const b = new Date(n + 'T12:00:00'), h = new Date(); let a = h.getFullYear() - b.getFullYear(); if (h < new Date(h.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const ordenar = (a, k) => (a || []).slice().sort((x, y) => String(x[k] || '').localeCompare(String(y[k] || '')));
const ultimo = a => a && a.length ? a[a.length - 1] : null;

function atualizarPlanilha(st) {
  const ss = planilha();
  const pac = st.pacientes || [], ag = st.agenda || [];
  const fase = id => ((st.protocolo || []).find(f => f.id === id) || {}).nome || '';
  const nome = id => (pac.find(p => p.id === id) || {}).nome || '';
  const hoje = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  aba(ss, 'Pacientes', ['Nome', 'Status', 'Fase do método', 'Início', 'Nascimento', 'Idade', 'WhatsApp', 'E-mail', 'Cidade', 'Parceiro(a)', 'Origem',
    'Tentando há (meses)', 'Diagnósticos', 'Último peso (kg)', 'IMC', 'Pontuação fértil (%)', 'Próxima consulta'],
    pac.map(p => {
      const a = p.anamnese || {}, av = ultimo(ordenar(p.avaliacoes, 'data')) || {}, sc = ultimo(ordenar(p.scores, 'data'));
      const imc = av.peso && av.altura ? Math.round(av.peso / Math.pow(av.altura / 100, 2) * 10) / 10 : '';
      const pts = sc ? Math.round(Object.keys(sc.resp || {}).reduce((s, k) => s + (+sc.resp[k] || 0), 0) / (N_PERGUNTAS_SCORE * 2) * 100) : '';
      const nx = ordenar(ag.filter(x => x.pid === p.id && x.status === 'Agendada' && x.data >= hoje), 'data')[0];
      return [p.nome, p.status, fase(p.fase), brData(p.inicio), brData(p.nascimento), idade(p.nascimento), p.telefone || '', p.email || '', p.cidade || '',
        p.parceiro || '', p.origem || '', a.tentando || '', (a.diagnosticos || []).join(', '), av.peso || '', imc, pts, nx ? brData(nx.data) + ' ' + (nx.hora || '') : ''];
    }));

  aba(ss, 'Consultas', ['Data', 'Hora', 'Paciente', 'Tipo', 'Modalidade', 'Status', 'Valor (R$)', 'Pago', 'Origem'],
    ordenar(ag, 'data').reverse().map(a => [brData(a.data), a.hora || '', nome(a.pid), a.tipo || '', a.modalidade || '', a.status || '', +a.valor || '', a.pago ? 'Sim' : 'Não', a.bookingId ? 'Site' : 'Manual']));

  const meses = {};
  ag.forEach(a => {
    if (!a.data) return;
    const m = a.data.slice(0, 7), o = meses[m] = meses[m] || [0, 0, 0, 0];
    if (a.pago) o[0] += +a.valor || 0; else if (a.status !== 'Faltou' && a.status !== 'Cancelada') o[1] += +a.valor || 0;
    if (a.status === 'Realizada') o[2]++;
    if (a.status === 'Faltou') o[3]++;
  });
  aba(ss, 'Financeiro', ['Mês', 'Recebido (R$)', 'A receber (R$)', 'Consultas realizadas', 'Faltas'],
    Object.keys(meses).sort().reverse().map(m => [m.split('-').reverse().join('/')].concat(meses[m])));

  const linhasEx = [];
  pac.forEach(p => (p.exames || []).forEach(e => {
    const v = e.v || {};
    const homa = v.glic && v.ins ? Math.round(v.glic * v.ins / 405 * 100) / 100 : '';
    linhasEx.push([e.data, p.nome, homa].concat(Object.keys(EXAMES).map(k => v[k] == null ? '' : v[k])));
  }));
  aba(ss, 'Exames', ['Data', 'Paciente', 'HOMA-IR'].concat(Object.keys(EXAMES).map(k => EXAMES[k])),
    linhasEx.sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(l => [brData(l[0])].concat(l.slice(1))));

  aba(ss, 'Gestações', ['Paciente', 'Beta positivo', 'Como engravidou', 'Meses de método', 'Diagnósticos', 'Depoimento'],
    pac.filter(p => p.resultado).map(p => {
      const meses = p.inicio && p.resultado.data ? Math.round((new Date(p.resultado.data) - new Date(p.inicio)) / 864e5 / 30.4 * 10) / 10 : '';
      return [p.nome, brData(p.resultado.data), p.resultado.forma || '', meses, ((p.anamnese || {}).diagnosticos || []).join(', '), p.resultado.obs || ''];
    }));

  abaAgendamentos(ss, lerJSON('BOOK_ID', []));
  const padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 1) ss.deleteSheet(padrao);
}
function abaAgendamentos(ss, lista) {
  aba(ss, 'Agendamentos online', ['Agendado em', 'Nome', 'E-mail', 'WhatsApp', 'Data', 'Hora', 'Tipo', 'Modalidade', 'Google Meet', 'Observações'],
    lista.slice().reverse().map(b => [Utilities.formatDate(new Date(b.criadoEm), TZ, 'dd/MM/yyyy HH:mm'), b.nome, b.email, b.telefone, brData(b.data), b.hora, b.tipo, b.modalidade, b.meet || '', b.obs || '']));
}
/** Rode pelo editor para recriar a planilha a qualquer momento. */
function recriarPlanilha() { atualizarPlanilha(lerJSON('STATE_ID', {})); Logger.log('📊 ' + planilha().getUrl()); }

/* ============ BACKUP DIÁRIO ============ */
function backupDiario() {
  const pasta = DriveApp.getFolderById(P.getProperty('BACKUP_ID'));
  DriveApp.getFileById(P.getProperty('STATE_ID')).makeCopy('dados-' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + '.json', pasta);
  const arquivos = [];
  const it = pasta.getFiles();
  while (it.hasNext()) arquivos.push(it.next());
  arquivos.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(30).forEach(f => f.setTrashed(true));
}

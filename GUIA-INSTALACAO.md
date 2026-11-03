# Guia de instalação: dados na nuvem + agendamento online

Tempo estimado: 15 minutos. Faça tudo **logado na conta Google da nutricionista** — a mesma da Google Agenda onde ela quer receber as consultas.

O que você vai ganhar:
- As pacientes ficam salvas no **Google Drive** dela (pasta "Florescer — Dados da plataforma"), com **backup automático diário** dos últimos 30 dias.
- A plataforma abre em **qualquer computador**, sempre com os mesmos dados.
- Uma **planilha no Google Sheets** ("Florescer — Planilha (somente leitura)", na mesma pasta) é atualizada sozinha a cada alteração, com as abas **Pacientes, Consultas, Financeiro, Exames, Gestações e Agendamentos online** — boa para filtrar, somar e consultar pelo celular. As edições continuam sendo feitas na plataforma; a planilha avisa se alguém tentar editar.
- A paciente **marca a própria consulta** em um link, recebe a **confirmação por e-mail** e o **convite na Google Agenda** (com link do Google Meet nas consultas online).
- Os horários já ocupados na Google Agenda dela ficam bloqueados automaticamente.

---

## Passo 1 — Criar o projeto no Google Apps Script

1. Abra **https://script.google.com** (logado na conta dela).
2. Clique em **+ Novo projeto**.
3. No topo, clique em **"Projeto sem título"** e renomeie para **Florescer API**.
4. Apague todo o conteúdo do arquivo **Código.gs**.
5. Abra **https://github.com/admmateusalmeida-hue/florescer-nutricao-fertil/blob/main/apps-script/Codigo.gs**, clique no ícone **Copy raw file** (dois quadradinhos, no canto direito acima do código) e cole no **Código.gs**.
6. Clique no ícone de **disquete (Salvar)**.

## Passo 2 — Ativar o Google Meet

1. No menu da esquerda, ao lado de **Serviços**, clique no **+**.
2. Procure **Google Calendar API**, selecione e clique em **Adicionar**.

> Sem isso tudo funciona, mas as consultas online não ganham link do Meet automaticamente.

## Passo 3 — Instalar (rodar uma vez)

1. Na barra de cima, no seletor de funções, escolha **instalar**.
2. Clique em **▶ Executar**.
3. O Google vai pedir autorização:
   - **Revisar permissões** → escolha a conta dela;
   - aparece "O Google não verificou este app" → clique em **Avançado** → **Acessar Florescer API (não seguro)**. É seguro: o app é dela mesma;
   - clique em **Permitir**.
4. Embaixo, no **Registro de execução**, aparece:
   `🔑 SUA CHAVE DE ACESSO: xxxxxxxx...`
   **Copie essa chave** e guarde em local seguro (ex.: gerenciador de senhas). Ela é a senha dos dados.

> Perdeu a chave? Escolha a função **mostrarChave** e clique em Executar.
>
> A planilha aparece em **Configurações → Dados na nuvem → Abrir planilha** depois de conectar (Passo 5). Se um dia ela for apagada, rode a função **recriarPlanilha**.

## Passo 4 — Publicar a API

1. Clique em **Implantar** (canto superior direito) → **Nova implantação**.
2. Clique na engrenagem ⚙ ao lado de "Selecione o tipo" → **App da Web**.
3. Preencha:
   - **Descrição:** Florescer API
   - **Executar como:** **Eu** (o e-mail dela)
   - **Quem pode acessar:** **Qualquer pessoa**
4. Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).

> "Qualquer pessoa" é necessário para as pacientes conseguirem agendar. Os dados das pacientes só saem com a chave de acesso do Passo 3.

## Passo 5 — Conectar a plataforma

1. Abra a plataforma: **https://admmateusalmeida-hue.github.io/florescer-nutricao-fertil/**
2. Vá em **Configurações → Dados na nuvem**.
3. Cole a **URL** (Passo 4) e a **chave de acesso** (Passo 3) e clique em **Conectar**.
4. No canto inferior do menu aparece **"● Salvo no Google Drive"**. Pronto!

Em outro computador, repita só o Passo 5.

## Passo 6 — Configurar o agendamento online

1. Em **Configurações → A paciente marca sozinha**, ajuste dias, horários, pausa, duração, tipos de consulta, modalidades e endereço.
2. Clique em **Salvar agenda online**.
3. Copie o **link de agendamento** e coloque na bio do Instagram, no WhatsApp Business e onde mais quiser.

> Para o link de agendamento funcionar, a URL da API também precisa estar no arquivo `config.js` do repositório. Envie a URL do Passo 4 para quem cuida do GitHub (ou edite `config.js` direto no GitHub: abra o arquivo → ✏️ → cole a URL entre as aspas → **Commit changes**).

---

## Como funciona no dia a dia

- **Nova paciente agenda pelo site:** o evento já aparece na Google Agenda, ela recebe um e-mail de aviso, e ao abrir a plataforma a paciente e a consulta entram sozinhas (a paciente fica com status "Avaliação inicial" e origem "Agendamento online").
- **Bloquear um horário** (férias, compromisso): basta criar o evento na Google Agenda.
- **Remarcar/cancelar:** altere ou exclua o evento na Google Agenda (o Google avisa a paciente) e ajuste a consulta na plataforma.

## Atualizar o código da API no futuro

Quando o `Codigo.gs` mudar no GitHub: cole o novo código, salve, e vá em **Implantar → Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar**. A URL continua a mesma.

## Limites do Google (contas gratuitas)

- Até 100 e-mails por dia (cada agendamento usa 2).
- Mais do que suficiente para um consultório.

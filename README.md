# Florescer · Nutrição Fértil

Plataforma clínica para nutricionista especializada em fertilidade. Arquivo único (`florescer.html`): abre direto no navegador, sem instalação.

## Módulos

- **Painel**: indicadores, próximas consultas, alertas clínicos e histórias de sucesso
- **Pacientes**: ficha completa com resumo, anamnese de fertilidade (incluindo o parceiro), ciclo menstrual, avaliação física, exames, gasto energético, plano alimentar, suplementação, pontuação fértil e evolução
- **Agenda**: semana de consultas e financeiro do mês
- **Meu Método**: fases do protocolo, editáveis
- **Alimentos**: base com valores aproximados (TACO/USDA) e nutrientes-chave da fertilidade
- **Configurações**: dados profissionais, backup e restauração

- **Agendamento online** (`agendar.html`): a paciente escolhe o horário, recebe confirmação por e-mail e convite na Google Agenda

## Como usar

- Plataforma: https://admmateusalmeida-hue.github.io/florescer-nutricao-fertil/
- Link de agendamento para pacientes: https://admmateusalmeida-hue.github.io/florescer-nutricao-fertil/agendar.html

Para guardar os dados no Google Drive e ativar o agendamento online, siga o [GUIA-INSTALACAO.md](GUIA-INSTALACAO.md). Sem a nuvem conectada, os dados ficam só no navegador (use **Configurações → Baixar backup**).

## Estrutura

- `florescer.html`: plataforma da nutricionista
- `agendar.html`: página pública de agendamento
- `config.js`: URL da API (não é secreta)
- `apps-script/Codigo.gs`: API no Google Apps Script (dados no Drive, Google Agenda e e-mails)

> Não envie backups com dados de pacientes para este repositório.

# Simulador de Atendimento — Claro

Protótipo público do simulador de atendimento comercial.

## Estrutura
- `index.html`: interface do simulador.
- `functions/ai.js`: ponte segura entre o navegador e a API da OpenAI.

## Configuração
No Cloudflare Pages, configure o secret `OPENAI_API_KEY` no projeto. A chave fica no servidor e não deve ser colocada no HTML.

O simulador usa a Responses API da OpenAI e o modelo configurado em `functions/ai.js`.

O limite de 10 simulações por dia é aplicado no navegador via `localStorage`. É adequado para o piloto, mas não é uma barreira antifraude: alguém pode contornar o limite trocando de navegador/dispositivo.

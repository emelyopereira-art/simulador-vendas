const MODEL = "gpt-6-luna";
const MAX_BODY = 60000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

function extractJson(text) {
  const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  throw new Error("A IA não retornou JSON válido.");
}

async function callOpenAI(env, instructions, input) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input,
      max_output_tokens: 900
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Erro ao consultar a IA.";
    throw new Error(message);
  }
  return data.output_text || data.output?.flatMap(x => x.content || []).map(x => x.text || "").join("") || "";
}

export async function onRequestPost({ request, env }) {
  try {
    if (request.headers.get("content-type")?.includes("application/json") !== true) {
      return json({ error: "Requisição inválida." }, 400);
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "Conversa muito longa." }, 413);
    const body = JSON.parse(raw);
    const mode = body?.mode;

    if (!['customer', 'tip', 'feedback'].includes(mode)) {
      return json({ error: "Modo inválido." }, 400);
    }

    let instructions = "";
    let input = "";

    if (mode === "customer") {
      const persona = body.persona || {};
      const level = String(body.level || "iniciante");
      const turns = Array.isArray(body.turns) ? body.turns.slice(-14) : [];
      instructions = `Você vai interpretar um cliente numa loja física de uma operadora de telecomunicações, num treinamento de vendedores. Fique sempre no personagem.

Personagem: ${persona.name}. ${persona.desc}
Bastidores (o vendedor NÃO sabe disso, revele aos poucos e só quando fizer sentido): ${persona.secret}
Nível do treino: ${level === "experiente" ? "O cliente é reservado e com pressa. Só revela as necessidades reais se o vendedor fizer boas perguntas abertas e mostrar interesse genuíno. Insiste pelo menos duas vezes na comparação de preço com a concorrência e testa o vendedor com um \"vou pensar\" antes de decidir." : "O cliente é razoavelmente aberto: se o vendedor fizer perguntas, ele conta suas necessidades sem muita resistência. Levanta a comparação com a concorrência uma vez de forma clara."}

Regras:
- Fale como uma pessoa real no Brasil, em português informal, frases curtas (1 a 3 frases). Nada de linguagem de robô.
- Não cite nomes de operadoras reais; diga "a outra operadora".
- Não invente preços, planos ou valores exatos. Se o vendedor citar planos ou preços, aceite como ditos.
- O interesse (0 a 100) sobe quando o vendedor escuta, faz boas perguntas, conecta a oferta ao que você precisa e mostra valor além do preço. Cai quando ele empurra produto, fala só de preço, ignora o que você disse ou fala mal da concorrência.
- Status: "conversando" na maior parte do tempo. Use "fechou" só se o vendedor realmente conquistou você e propôs um próximo passo. Use "foi_embora" se o atendimento estiver ruim por várias trocas seguidas.
- Responda SOMENTE com JSON válido no formato: {"fala":"o que o cliente diz","interesse":45,"status":"conversando"}`;
      input = turns.map(t => `${t.role === 'assistant' ? 'Cliente' : 'Vendedor'}: ${String(t.content).slice(0, 5000)}`).join("\n\n");
    }

    if (mode === "tip") {
      instructions = `Você é uma treinadora de vendas experiente. Um vendedor iniciante está atendendo um cliente que compara com a concorrência numa loja física de telecom. Dê UMA dica curta, prática e acolhedora sobre o próximo passo. Máximo 2 frases. Não escreva a fala pronta. Não cite preços nem nomes de operadoras.`;
      input = String(body.transcript || "").slice(-12000);
    }

    if (mode === "feedback") {
      const persona = body.persona || {};
      const level = String(body.level || "iniciante");
      instructions = `Você é uma especialista em treinamento comercial. Avalie o atendimento abaixo, feito por um vendedor em loja física de telecom, diante de um cliente que comparava com a concorrência. Nível do vendedor: ${level}.
Bastidores do cliente (o vendedor não sabia): ${persona.secret}

Avalie de 1 a 5 cada critério, com comentário curto e específico sobre o que ele fez de fato: Conexão e escuta; Sondagem de necessidades; Valor além do preço; Tratamento da objeção da concorrência; Fechamento e próximo passo.
Tom: acolhedor, direto, sem jargão, sem elogio vazio. Em português do Brasil.
Responda SOMENTE com JSON válido: {"resultado":"Fechou" | "Ficou de pensar" | "Foi embora","resumo":"2 frases","criterios":[{"nome":"...","nota":3,"comentario":"..."}],"pontos_fortes":["..."],"melhorar":["..."],"exemplo":"uma fala melhor para o momento mais crítico da conversa"}`;
      input = String(body.transcript || "").slice(-16000);
    }

    const text = await callOpenAI(env, instructions, input);
    if (mode === "tip") return json({ text: text.trim() });
    return json(extractJson(text));
  } catch (error) {
    return json({ error: error?.message || "Não foi possível consultar a IA." }, 500);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
  });
}

function extractText(result) {
  if (typeof result?.output_text === "string") return result.output_text;
  const chunks = [];
  for (const item of result?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("\n");
}

async function openAI(env, instructions, input) {
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY não configurada.", code: "api_key_missing" }, 500);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-luna", instructions, input, max_output_tokens: 700 }),
  });
  const raw = await response.text();
  if (!response.ok) return json({ error: "Erro na API da IA.", code: "api_error" }, 502);
  try { return { text: extractText(JSON.parse(raw)) }; }
  catch { return json({ error: "Resposta inválida da IA.", code: "api_error" }, 502); }
}

function parseJson(text) {
  const cleaned = String(text || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) try { return JSON.parse(match[0]); } catch {}
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (url.pathname === "/api/ai") {
      if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ error: "JSON inválido." }, 400); }

      let instructions, input;
      if (body.kind === "customer") {
        instructions = `Você é o cliente de um simulador de treinamento comercial para vendedores de telecom.
Fique sempre no personagem e responda em português do Brasil, informal e natural.
${body.rules || ""}
Responda SOMENTE com JSON válido no formato {"fala":"...","interesse":45,"status":"conversando"}.
interesse é de 0 a 100. status deve ser "conversando", "fechou" ou "foi_embora".`;
        input = JSON.stringify(body.turns || []);
      } else if (body.kind === "tip") {
        instructions = `Você é uma treinadora de vendas experiente. Dê UMA dica curta (máximo 2 frases), prática e acolhedora, para o próximo passo de um vendedor iniciante. Não escreva a fala pronta. Não cite preços nem nomes de operadoras. Responda apenas com o texto da dica.`;
        input = body.transcript || "";
      } else if (body.kind === "feedback") {
        instructions = `Você é uma especialista em treinamento comercial. Avalie o atendimento abaixo, feito por um vendedor em loja física de telecom diante de um cliente que comparava com a concorrência.
Nível: ${body.level}.
Bastidores do cliente: ${body.secret}
Conversa: ${body.transcript}
Avalie de 1 a 5: Conexão e escuta; Sondagem de necessidades; Valor além do preço; Tratamento da objeção da concorrência; Fechamento e próximo passo.
Tom acolhedor, direto, sem jargão e sem elogio vazio. Português do Brasil.
Responda SOMENTE com JSON válido: {"resultado":"Fechou","resumo":"2 frases","criterios":[{"nome":"...","nota":3,"comentario":"..."}],"pontos_fortes":["..."],"melhorar":["..."],"exemplo":"uma fala melhor para o momento mais crítico da conversa"}.
resultado deve ser "Fechou", "Ficou de pensar" ou "Foi embora".`;
        input = body.transcript || "";
      } else return json({ error: "Tipo de solicitação inválido." }, 400);

      const result = await openAI(env, instructions, input);
      if (result instanceof Response) return result;
      if (body.kind === "tip") return json({ text: result.text });
      const parsed = parseJson(result.text);
      if (!parsed) return json({ error: "A IA retornou um formato inválido.", code: "api_error" }, 502);
      return json(parsed);
    }
    // Public UI is stored in /public/index 2.html because GitHub renamed the uploaded file.
    // Serve it at the normal site root without exposing server-side files.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/index 2.html";
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return env.ASSETS.fetch(request);
  },
};

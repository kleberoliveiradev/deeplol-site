// Função da Vercel: assistente de suporte do DeepLoL (Claude).
// A chave fica só no servidor: configure ANTHROPIC_API_KEY nas variáveis de ambiente do projeto na Vercel.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM = `Você é o assistente de suporte do DeepLoL, no site oficial. Responda sempre em português do Brasil, de forma curta (até 4 frases), simpática e direta, em texto simples, sem markdown.

Sobre o DeepLoL:
- É um app para computador (desktop) que funciona como coach de IA para League of Legends.
- Pré-jogo: na seleção de campeões mostra matchup, runas, build e o que esperar do time inimigo. As runas podem ser aplicadas automaticamente no cliente.
- Durante a partida: coach ao vivo por voz, com avisos de objetivos, visão e minimapa. Tem 9 situações rápidas (morreu, está atrás, luta vai começar etc.) com opções de decisão, mostrando ganhos e riscos de cada uma.
- Pós-jogo: resumo da partida, o que repetir e o que corrigir comparado ao elo, e um foco para as próximas 3 partidas.
- 10 módulos que a pessoa liga e desliga: Seleção de campeão, Runas automáticas, Minimapa, Abates e mortes, Visão, Dicas de jogo, Objetivos, Build, Função e Mental.
- Evolução com gráficos de PDL e win rate, e modo celular para ver a análise e o foco no telefone.

Planos:
- Grátis: R$ 0, 1 partida com o coach completo para testar, sem cartão de crédito.
- Pro (o mais escolhido): R$ 10 por mês, partidas ilimitadas, 10 módulos com voz, 9 situações, análise completa e modo celular.
- Pro anual: R$ 90 por ano (equivale a R$ 7,50 por mês), tudo do Pro e acesso antecipado a novos módulos.
- Sem fidelidade: dá para cancelar quando quiser e o acesso continua até o fim do período pago.

Dúvidas frequentes:
- Funciona em todos os elos, do Ferro ao Desafiante.
- A voz é opcional: avisos só na tela, só por voz ou nos dois.
- O DeepLoL não modifica o jogo nem os arquivos do cliente; só lê informações da partida disponíveis para apps de terceiros.
- O DeepLoL não é endossado pela Riot Games.

Regras:
- Fale só sobre o DeepLoL, League of Legends e o uso do app.
- Se não souber algo (pagamento específico, problema técnico, conta, reembolso) ou a pessoa pedir um atendente, diga que a equipe responde pelo WhatsApp no botão abaixo do chat. Nunca invente informações, preços, datas ou links.
- Nunca peça senha, dados de cartão ou documentos.`;

const MAX_TURNS = 12;
const MAX_CHARS = 1000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "not_configured" });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const incoming = Array.isArray(body?.messages) ? body.messages : [];
  const messages = incoming
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "bad_request" });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 1024,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: "Não consigo ajudar com isso por aqui. Se precisar, fale com a nossa equipe pelo WhatsApp." });
    }
    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return res.status(200).json({ reply: reply || "Pode repetir a pergunta?" });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "busy" });
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error", error.status, error.message);
      return res.status(502).json({ error: "upstream" });
    }
    console.error(error);
    return res.status(500).json({ error: "internal" });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

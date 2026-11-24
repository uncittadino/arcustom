import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb"
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo non consentito" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Chiave GEMINI_API_KEY non configurata su Vercel." });
    }

    const { baseImage, maskImage, depthGuideImage, hasDepth, prompt, viewName } = req.body || {};
    if (!baseImage || !maskImage || !prompt) {
      return res.status(400).json({ error: "Dati mancanti: immagine, maschera o descrizione." });
    }

    const base64Car = baseImage.replace(/^data:image\/\w+;base64,/, "");
    const base64Mask = maskImage.replace(/^data:image\/\w+;base64,/, "");

    const ai = new GoogleGenAI({ apiKey });

    const depthInstructions = hasDepth && depthGuideImage
      ? "Image 3 is a 3D depth guide: ORANGE strokes (#f97316) indicate protruding/outer edges or forward lip extension; SKY BLUE strokes (#38bdf8) indicate recessed/inner channels, pockets, or inward surfaces. Use these depth cues to give realistic 3D volume, shadows, and relief to the component."
      : "Infer natural 3D automotive volume, perspective, and contact shadows from the car's body lines and lighting.";

    const fullPrompt = `You are an expert automotive aerodynamic body kit designer.
Image 1 is a high-resolution photo of an Alfa Romeo Giulia (${viewName || "exterior view"}).
Image 2 is a binary mask where the WHITE region indicates the ONLY area of the car where you must design and integrate a custom aftermarket body kit component.
${depthInstructions}

User design request: "${prompt}"

Strict rules:
1. Modify ONLY the area corresponding to the WHITE region in Image 2.
2. Keep the rest of the Alfa Romeo Giulia, paint color, wheels, reflections, lighting, shadows, and the entire background 100% identical to Image 1.
3. Make the new body kit component look like a real, OEM-grade manufactured automotive part with realistic materials, crisp panel gaps, and natural perspective.
4. Return only the final edited photograph.`;

    const contents = [
      fullPrompt,
      { inlineData: { mimeType: "image/jpeg", data: base64Car } },
      { inlineData: { mimeType: "image/png", data: base64Mask } }
    ];

    if (hasDepth && depthGuideImage) {
      const base64Depth = depthGuideImage.replace(/^data:image\/\w+;base64,/, "");
      contents.push({ inlineData: { mimeType: "image/png", data: base64Depth } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
      config: {
        responseModalities: ["IMAGE"]
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart) {
      return res.status(500).json({ error: "L'AI non ha restituito un'immagine valida. Riprova." });
    }

    const mime = imagePart.inlineData.mimeType || "image/png";
    const resultUrl = `data:${mime};base64,${imagePart.inlineData.data}`;

    return res.status(200).json({ image: resultUrl });
  } catch (err) {
    console.error("Errore generazione AI:", err);
    return res.status(500).json({ error: err.message || "Errore interno durante la generazione." });
  }
}

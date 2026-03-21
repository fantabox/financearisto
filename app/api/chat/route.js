import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextResponse } from "next/server";

// Artık fixCategory fonksiyonuna ihtiyacımız yok!
// Gemini'ye sadece bu kategorileri kullanabileceğini söyleyeceğiz.
const CATEGORIES = [
  "🍔 Yeme-İçme", "🎉 Eğlence/Sosyal", "🏠 Ev/Yaşam", "🚌 Ulaşım",
  "💡 Faturalar", "🛍️ Alışveriş", "🏥 Sağlık", "💰 Gelir/Yatırım", "📦 Diğer"
];

export async function POST(req) {
  const origin = req.headers.get('origin');
  const allowedOrigins = ["http://localhost:3000", "https://finansasistan.vercel.app"];
  
  const isOriginAllowed = origin ? allowedOrigins.some(domain => origin.includes(domain)) : true;
  
  if (!isOriginAllowed) {
    return NextResponse.json({ error: "Yetkisiz Giriş! 🚫" }, { status: 401 });
  }

  try {
    const { message, currency = 'JPY', language = 'tr', userDate } = await req.json();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // 1. ZORUNLU JSON ŞEMASI TANIMLIYORUZ (Gemini 2.0 Özelliği)
    const schema = {
      type: SchemaType.OBJECT,
      properties: {
        reply: { 
            type: SchemaType.STRING, 
            description: "Kullanıcıya vereceğin samimi onay veya cevap mesajı." 
        },
        transactions: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              amount: { type: SchemaType.NUMBER, description: "Harcamalar için negatif, gelirler için pozitif sayı." },
              category: { 
                  type: SchemaType.STRING, 
                  enum: CATEGORIES, // YAPAY ZEKA SADECE BU LİSTEDEKİLERİ SEÇEBİLİR
                  description: "İşlemin en uygun kategorisi." 
              },
              desc: { type: SchemaType.STRING, description: "İşlemin kısa ve öz açıklaması (Örn: Starbucks, Maaş)" },
              date: { type: SchemaType.STRING, description: "YYYY-MM-DD formatında işlem tarihi." }
            },
            required: ["amount", "category", "desc", "date"]
          }
        }
      },
      required: ["reply", "transactions"]
    };

    // 2. MODELİ ŞEMA İLE BAŞLATIYORUZ
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: { 
            responseMimeType: "application/json",
            responseSchema: schema // Şemayı buraya ekledik
        } 
    });

    const now = new Date();
    const isoDate = userDate ? userDate : now.toISOString().split('T')[0];

    // 3. DAHA TEMİZ VE KISA BİR PROMPT
    const prompt = `
    Sen zeki bir kişisel muhasebe asistanısın. 
    Bugünün tarihi: ${isoDate}.
    Kullanıcının Para Birimi: ${currency} (${currency === 'JPY' ? 'Tam sayıdır, kuruş/cent olmaz.' : 'Kuruş/cent olabilir.'}).
    
    Kullanıcının dilini otomatik algıla ve 'reply' alanını o dilde doldur (Türkçe ise Türkçe, İngilizce ise İngilizce, Japonca ise Japonca vb.).

    Kullanıcı Mesajı: "${message}"

    GÖREV:
    Kullanıcının mesajında bir finansal işlem (harcama veya gelir) olup olmadığını analiz et.
    - Eğer finansal bir işlem varsa, bunu 'transactions' dizisine ekle. Tutarı harcama ise eksi (-), gelir ise artı (+) olarak yaz.
    - Eğer sadece bir sohbetse veya işlem yoksa, 'transactions' dizisini boş bırak.
    - İşlemin kategorisini bağlama göre (örneğin Sushiro, Izakaya veya Cafe ise Yeme-İçme veya Eğlence) en mantıklı şekilde eşleştir.
    `;

    const result = await model.generateContent(prompt);
    
    // 4. METİN TEMİZLİĞİNE VEYA REGEX'E GEREK YOK!
    // JSON Schema kullandığımız için Gemini doğrudan hatasız JSON objesi metni döndürür.
    const jsonResponse = JSON.parse(result.response.text());

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error("Gemini Hatası:", error);
    return NextResponse.json({ 
        reply: "Üzgünüm, şu an bunu algılayamadım.", 
        transactions: [] 
    }, { status: 500 });
  }
}
// app/layout.js
import "./globals.css";

// 1. ZOOM VE MOBİL GÖRÜNÜM AYARLARI
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Zoom yapmayı engeller
  themeColor: '#ffffff', // Tarayıcı çubuğu rengi
};

// 2. SEO VE İKON AYARLARI
export const metadata = {
  title: "Gelir & Gider AI",
  description: "Yapay Zeka Destekli Muhasebe",
  
  // iOS ve Android ana ekran kısayolları için:
  appleWebApp: {
    capable: true, // Safari arayüzünü gizler (Tam ekran moduna yakın)
    statusBarStyle: 'default',
    title: "Gelir & Gider AI",
  },
  
  // İkon tanımları
  icons: {
    icon: '/icon.png',        // Genel favicon (Android Chrome bunu kullanır)
    shortcut: '/icon-192x192.png',
    apple: '/apple-icon.png', // iOS Ana Ekran ikonu (ÖNEMLİ)
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      
      <body 
        className="bg-slate-50 text-slate-900 font-['Manrope'] antialiased selection:bg-blue-100 selection:text-blue-700"
        suppressHydrationWarning={true} 
      >
        {children}
      </body>
    </html>
  );
}

// app/layout.js
import "./globals.css";

export const metadata = {
  title: "Finans AI",
  description: "Yapay Zeka Destekli Muhasebe",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        {/* Google Fonts Bağlantıları (Düzeltilmiş) */}
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
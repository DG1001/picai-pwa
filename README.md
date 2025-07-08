# PicAI PWA - Smart Photo Analysis

Eine Progressive Web App (PWA) für intelligente Fotoanalyse mit automatischer Gesichtsverwischung - komplett im Browser ohne Backend!

## ✨ Features

- 📸 **Kamera-Integration** über WebRTC (getUserMedia API)
- 🤖 **KI-Analyse** mit DeepSeek API
- 👤 **Automatische Gesichtserkennung** und Verwischung
- 📱 **PWA-Funktionalität** - installierbar auf dem Smartphone
- 🔒 **Datenschutz** - alles läuft lokal im Browser
- 🌐 **Offline-fähig** durch Service Worker

## 🚀 Installation & Setup

### 1. DeepSeek API Key konfigurieren

Ersetze in `app.js` Zeile 11:
```javascript
this.DEEPSEEK_API_KEY = 'YOUR_DEEPSEEK_API_KEY_HERE';
```

### 2. HTTPS Server starten

Da Kamera-Zugriff HTTPS erfordert, nutze einen lokalen HTTPS-Server:

```bash
# Mit Python
python -m http.server 8000

# Mit Node.js (http-server)
npx http-server -p 8000

# Mit Live Server (VS Code Extension)
# Rechtsklick auf index.html -> "Open with Live Server"
```

### 3. Im Browser öffnen

Öffne `https://localhost:8000` in deinem Smartphone-Browser.

## 📱 Als PWA installieren

1. Öffne die App im Chrome/Safari Browser
2. Tippe auf das Menü (⋮) 
3. Wähle "Zum Startbildschirm hinzufügen"
4. Die App verhält sich nun wie eine native App!

## 🛠️ Technische Details

### Browser APIs verwendet:
- **getUserMedia()** - Kamera-Zugriff
- **Canvas API** - Bildverarbeitung und Verwischung
- **Fetch API** - DeepSeek API Kommunikation
- **Service Worker** - Offline-Funktionalität
- **Web App Manifest** - PWA Installation

### Unterstützte Browser:
- ✅ Chrome (Android/Desktop)
- ✅ Safari (iOS/macOS)
- ✅ Firefox (Android/Desktop)
- ✅ Edge (Android/Desktop)

### Gesichtsverwischung:
- Verwendet Canvas 2D API
- Kreisförmige Masken basierend auf DeepSeek Koordinaten
- Echtzeit-Toggle zwischen Original und verwischtem Bild

## 🔧 Anpassungen

### Kamera-Einstellungen ändern:
```javascript
// In app.js, setupCamera() Methode
this.stream = await navigator.mediaDevices.getUserMedia({
    video: { 
        facingMode: 'environment', // 'user' für Frontkamera
        width: { ideal: 1920 },
        height: { ideal: 1080 }
    }
});
```

### Verwischungseffekt anpassen:
```javascript
// In app.js, applyBlurEffect() Methode
ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Transparenz ändern
```

## 🔒 Datenschutz & Sicherheit

- **Keine Datenübertragung** außer an DeepSeek API
- **Lokale Verarbeitung** aller Bilder
- **HTTPS erforderlich** für Kamera-Zugriff
- **Keine permanente Speicherung** von Fotos

## 🐛 Troubleshooting

### Kamera funktioniert nicht:
- Stelle sicher, dass HTTPS verwendet wird
- Erlaube Kamera-Berechtigung im Browser
- Teste mit verschiedenen Browsern

### API-Fehler:
- Überprüfe DeepSeek API Key
- Kontrolliere Internetverbindung
- Prüfe API-Quota

### PWA Installation nicht möglich:
- Verwende HTTPS
- Stelle sicher, dass manifest.json erreichbar ist
- Teste mit Chrome/Safari

## 📂 Dateistruktur

```
picai-pwa/
├── index.html          # Haupt-HTML Datei
├── app.js             # JavaScript Logik
├── manifest.json      # PWA Manifest
├── sw.js             # Service Worker
├── icon-192.png      # App Icon (192x192)
├── icon-512.png      # App Icon (512x512)
└── README.md         # Diese Datei
```

## 🌟 Vorteile gegenüber nativer App

- ✅ **Keine App Store** Genehmigung nötig
- ✅ **Sofortige Updates** ohne Download
- ✅ **Plattformübergreifend** (iOS, Android, Desktop)
- ✅ **Kleinere Dateigröße** (~50KB vs. mehrere MB)
- ✅ **Einfache Entwicklung** mit Web-Technologien

## 🔮 Mögliche Erweiterungen

- 📊 Offline-Analyse mit TensorFlow.js
- 🎨 Verschiedene Verwischungseffekte
- 📁 Lokale Bildgalerie
- 🔄 Batch-Verarbeitung mehrerer Bilder
- 🎯 Objekterkennung zusätzlich zu Gesichtern
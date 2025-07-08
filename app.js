class PicAI {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.stream = null;
        this.currentPhoto = null;
        this.analysisResult = null;
        this.isBlurred = false;
        
        // DeepSeek API Configuration
        this.DEEPSEEK_API_KEY = 'API-KEY';
        this.DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
        
        this.initializeApp();
    }

    async initializeApp() {
        await this.setupCamera();
        this.setupEventListeners();
        
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    }

    async setupCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });
            this.video.srcObject = this.stream;
        } catch (error) {
            this.showError('Kamera-Zugriff fehlgeschlagen. Bitte Berechtigung erteilen.');
            console.error('Camera error:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('captureBtn').addEventListener('click', () => this.capturePhoto());
        document.getElementById('retakeBtn').addEventListener('click', () => this.retakePhoto());
        document.getElementById('toggleBlurBtn').addEventListener('click', () => this.toggleBlur());
    }

    capturePhoto() {
        if (!this.stream) return;

        // Set canvas size to video dimensions
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        // Draw video frame to canvas
        this.ctx.drawImage(this.video, 0, 0);
        
        // Convert to blob
        this.canvas.toBlob(async (blob) => {
            this.currentPhoto = blob;
            await this.analyzePhoto(blob);
        }, 'image/jpeg', 0.8);
    }

    async analyzePhoto(photoBlob) {
        this.showLoading(true);
        
        try {
            // Convert blob to base64
            const base64 = await this.blobToBase64(photoBlob);
            
            // Call DeepSeek API
            const result = await this.callDeepSeekAPI(base64);
            this.analysisResult = result;
            
            // Show results
            this.showResults(photoBlob, result);
            
        } catch (error) {
            this.showError('Analyse fehlgeschlagen: ' + error.message);
            console.error('Analysis error:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async callDeepSeekAPI(base64Image) {
        const response = await fetch(this.DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-vl-7b-chat',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Analysiere dieses Bild und beschreibe was du siehst. Falls Personen im Bild sind, gib auch die ungefähren Koordinaten ihrer Gesichter als Kreise an (x, y, radius). Antworte auf Deutsch.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }],
                max_tokens: 1000,
                temperature: 0.3,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`DeepSeek API Fehler: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('Keine Antwort von DeepSeek erhalten');
        }

        // Parse response - DeepSeek returns text, we need to extract coordinates manually
        const description = content;
        const faces = [];
        
        // Try to extract face coordinates from text
        const coordinatePattern = /(?:gesicht|face|person).*?(?:bei|at|position).*?(\d+).*?(\d+).*?(?:radius|größe).*?(\d+)/gi;
        let match;
        while ((match = coordinatePattern.exec(content)) !== null) {
            faces.push({
                x: parseInt(match[1]),
                y: parseInt(match[2]),
                radius: parseInt(match[3]) || 50
            });
        }
        
        return {
            description: description,
            faces: faces
        };
    }

    showResults(photoBlob, result) {
        // Hide camera, show results
        document.getElementById('cameraView').style.display = 'none';
        document.getElementById('resultsView').style.display = 'block';
        
        // Display image
        const resultImage = document.getElementById('resultImage');
        resultImage.src = URL.createObjectURL(photoBlob);
        
        // Display description
        document.getElementById('description').textContent = result.description;
        
        // Handle faces
        if (result.faces && result.faces.length > 0) {
            this.setupFaceBlurring(result.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            
            // Show face info
            const facesInfo = document.getElementById('facesInfo');
            const faceCount = document.getElementById('faceCount');
            const facesList = document.getElementById('facesList');
            
            faceCount.textContent = result.faces.length;
            facesList.innerHTML = result.faces.map((face, index) => 
                `<div class="face-item">Gesicht ${index + 1}: Zentrum (${Math.round(face.x)}, ${Math.round(face.y)}), Radius: ${Math.round(face.radius)}</div>`
            ).join('');
            
            facesInfo.classList.remove('hidden');
        }
    }

    setupFaceBlurring(faces) {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        
        resultImage.onload = () => {
            // Set canvas size to match image
            blurredCanvas.width = resultImage.naturalWidth;
            blurredCanvas.height = resultImage.naturalHeight;
            blurredCanvas.style.width = resultImage.offsetWidth + 'px';
            blurredCanvas.style.height = resultImage.offsetHeight + 'px';
            
            this.createBlurredVersion(resultImage, blurredCanvas, faces);
        };
    }

    createBlurredVersion(image, canvas, faces) {
        const ctx = canvas.getContext('2d');
        
        // Draw original image
        ctx.drawImage(image, 0, 0);
        
        // Apply blur to face areas
        faces.forEach(face => {
            // Scale coordinates to image size
            const scaleX = image.naturalWidth / image.offsetWidth;
            const scaleY = image.naturalHeight / image.offsetHeight;
            
            const x = face.x * scaleX;
            const y = face.y * scaleY;
            const radius = face.radius * Math.min(scaleX, scaleY);
            
            // Create circular clipping path
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.clip();
            
            // Apply blur effect by drawing smaller version
            const imageData = ctx.getImageData(x - radius, y - radius, radius * 2, radius * 2);
            this.applyBlurEffect(ctx, imageData, x - radius, y - radius, radius * 2, radius * 2);
            
            ctx.restore();
        });
    }

    applyBlurEffect(ctx, imageData, x, y, width, height) {
        // Simple blur effect by drawing semi-transparent rectangles
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, width, height);
        
        // Add some noise for better blur effect
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = `rgba(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255}, 0.1)`;
            ctx.fillRect(
                x + Math.random() * width,
                y + Math.random() * height,
                Math.random() * 10,
                Math.random() * 10
            );
        }
    }

    toggleBlur() {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        const toggleBtn = document.getElementById('toggleBlurBtn');
        
        this.isBlurred = !this.isBlurred;
        
        if (this.isBlurred) {
            resultImage.style.display = 'none';
            blurredCanvas.style.display = 'block';
            toggleBtn.textContent = 'Original zeigen';
        } else {
            resultImage.style.display = 'block';
            blurredCanvas.style.display = 'none';
            toggleBtn.textContent = 'Gesichter verwischen';
        }
    }

    retakePhoto() {
        // Reset state
        this.currentPhoto = null;
        this.analysisResult = null;
        this.isBlurred = false;
        
        // Hide results, show camera
        document.getElementById('resultsView').style.display = 'none';
        document.getElementById('cameraView').style.display = 'flex';
        
        // Hide optional elements
        document.getElementById('toggleBlurBtn').classList.add('hidden');
        document.getElementById('facesInfo').classList.add('hidden');
        
        // Clear images
        document.getElementById('resultImage').src = '';
        document.getElementById('blurredCanvas').getContext('2d').clearRect(0, 0, 1000, 1000);
    }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        const errorEl = document.getElementById('error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PicAI();
});

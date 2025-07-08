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
            
            // Show image anyway with manual face detection option
            this.showResults(photoBlob, {
                description: 'Automatische Analyse fehlgeschlagen. Sie können manuell Gesichter markieren.',
                faces: []
            });
        } finally {
            this.showLoading(false);
        }
    }

    async callDeepSeekAPI(base64Image) {
        // Validate API key
        if (!this.DEEPSEEK_API_KEY || this.DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY_HERE') {
            throw new Error('Bitte DeepSeek API Key in app.js konfigurieren');
        }

        // Try different API formats
        const requestBody = {
            model: 'deepseek-vl-7b-chat',
            messages: [{
                role: 'user',
                content: 'Beschreibe dieses Bild auf Deutsch.',
                image: base64Image
            }],
            max_tokens: 500,
            temperature: 0.3,
            stream: false
        };

        console.log('Sending request to DeepSeek API...');
        
        const response = await fetch(this.DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            
            if (response.status === 422) {
                throw new Error('Ungültiges Bildformat oder API-Parameter');
            } else if (response.status === 401) {
                throw new Error('Ungültiger API Key');
            } else if (response.status === 429) {
                throw new Error('API Rate Limit erreicht');
            } else {
                throw new Error(`API Fehler ${response.status}: ${errorText}`);
            }
        }

        const data = await response.json();
        console.log('API Response:', data);
        
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('Keine Antwort von DeepSeek erhalten');
        }

        // Simple face detection based on description
        const faces = this.extractFacesFromDescription(content);
        
        return {
            description: content,
            faces: faces
        };
    }

    extractFacesFromDescription(description) {
        const faces = [];
        const lowerDesc = description.toLowerCase();
        
        // Simple heuristic: if people are mentioned, add some demo face coordinates
        if (lowerDesc.includes('person') || lowerDesc.includes('mensch') || 
            lowerDesc.includes('mann') || lowerDesc.includes('frau') ||
            lowerDesc.includes('kind') || lowerDesc.includes('gesicht')) {
            
            // Add demo coordinates - in real app you'd use proper face detection
            faces.push({
                x: 200,
                y: 150,
                radius: 60
            });
            
            // If multiple people mentioned, add more faces
            if (lowerDesc.includes('zwei') || lowerDesc.includes('mehrere') || lowerDesc.includes('gruppe')) {
                faces.push({
                    x: 350,
                    y: 180,
                    radius: 55
                });
            }
        }
        
        return faces;
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
        } else {
            // Add manual face detection button
            this.addManualFaceDetection();
        }
    }

    addManualFaceDetection() {
        const imageSection = document.querySelector('.image-section');
        const manualBtn = document.createElement('button');
        manualBtn.className = 'btn btn-secondary';
        manualBtn.textContent = 'Gesichter manuell markieren';
        manualBtn.onclick = () => this.enableManualFaceDetection();
        imageSection.appendChild(manualBtn);
    }

    enableManualFaceDetection() {
        const resultImage = document.getElementById('resultImage');
        resultImage.style.cursor = 'crosshair';
        
        resultImage.onclick = (e) => {
            const rect = resultImage.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Scale to image coordinates
            const scaleX = resultImage.naturalWidth / resultImage.offsetWidth;
            const scaleY = resultImage.naturalHeight / resultImage.offsetHeight;
            
            const face = {
                x: x * scaleX,
                y: y * scaleY,
                radius: 60
            };
            
            if (!this.analysisResult.faces) {
                this.analysisResult.faces = [];
            }
            this.analysisResult.faces.push(face);
            
            this.setupFaceBlurring(this.analysisResult.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            
            // Update face count
            document.getElementById('faceCount').textContent = this.analysisResult.faces.length;
            document.getElementById('facesInfo').classList.remove('hidden');
        };
        
        this.showError('Klicken Sie auf Gesichter im Bild um sie zu markieren', 3000);
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
        
        // If image already loaded
        if (resultImage.complete) {
            resultImage.onload();
        }
    }

    createBlurredVersion(image, canvas, faces) {
        const ctx = canvas.getContext('2d');
        
        // Draw original image
        ctx.drawImage(image, 0, 0);
        
        // Apply blur to face areas
        faces.forEach(face => {
            // Create circular clipping path
            ctx.save();
            ctx.beginPath();
            ctx.arc(face.x, face.y, face.radius, 0, 2 * Math.PI);
            ctx.clip();
            
            // Apply blur effect
            this.applyBlurEffect(ctx, face.x - face.radius, face.y - face.radius, face.radius * 2, face.radius * 2);
            
            ctx.restore();
        });
    }

    applyBlurEffect(ctx, x, y, width, height) {
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
        
        // Remove manual detection buttons
        const manualBtns = document.querySelectorAll('.btn-secondary');
        manualBtns.forEach(btn => {
            if (btn.textContent.includes('manuell')) {
                btn.remove();
            }
        });
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

    showError(message, duration = 5000) {
        const errorEl = document.getElementById('error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, duration);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PicAI();
});
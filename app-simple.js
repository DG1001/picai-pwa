class PicAI {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.stream = null;
        this.currentPhoto = null;
        this.analysisResult = null;
        this.isBlurred = false;
        this.faceDetectionModel = null;
        this.originalImageData = null;
        this.blurredImageData = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        await this.setupCamera();
        await this.loadFaceDetectionModel();
        this.setupEventListeners();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    }

    async loadFaceDetectionModel() {
        try {
            this.showError('Lade Gesichtserkennungsmodell...', 3000);
            await tf.ready();
            this.faceDetectionModel = await blazeface.load();
            this.showError('Gesichtserkennung bereit!', 2000);
        } catch (error) {
            console.error('Model loading error:', error);
            this.showError('Gesichtserkennungsmodell konnte nicht geladen werden. Manuelle Markierung verfügbar.');
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

        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0);
        
        this.canvas.toBlob(async (blob) => {
            this.currentPhoto = blob;
            await this.analyzePhoto(blob);
        }, 'image/jpeg', 0.8);
    }

    async analyzePhoto(photoBlob) {
        this.showLoading(true);
        
        try {
            const result = await this.detectFacesWithTensorFlow(photoBlob);
            this.analysisResult = result;
            this.showResults(photoBlob, result);
        } catch (error) {
            this.showError('Analyse fehlgeschlagen: ' + error.message);
            this.showResults(photoBlob, {
                description: 'Automatische Gesichtserkennung fehlgeschlagen. Manuelle Markierung verfügbar.',
                faces: []
            });
        } finally {
            this.showLoading(false);
        }
    }

    async detectFacesWithTensorFlow(photoBlob) {
        const img = new Image();
        const imageUrl = URL.createObjectURL(photoBlob);
        
        return new Promise(async (resolve) => {
            img.onload = async () => {
                try {
                    let faces = [];
                    
                    if (this.faceDetectionModel) {
                        const predictions = await this.faceDetectionModel.estimateFaces(img, false);
                        
                        faces = predictions.map(prediction => {
                            const [x1, y1] = prediction.topLeft;
                            const [x2, y2] = prediction.bottomRight;
                            
                            const centerX = (x1 + x2) / 2;
                            const centerY = (y1 + y2) / 2;
                            const radius = Math.max((x2 - x1), (y2 - y1)) / 2 * 1.2;
                            
                            return {
                                x: centerX,
                                y: centerY,
                                radius: radius,
                                confidence: prediction.probability ? prediction.probability[0] : 1
                            };
                        });
                    }
                    
                    resolve({
                        description: `Foto analysiert (${img.width}x${img.height} Pixel). ${faces.length} Gesicht${faces.length !== 1 ? 'er' : ''} automatisch erkannt.`,
                        faces: faces
                    });
                    
                } catch (error) {
                    console.error('TensorFlow detection error:', error);
                    resolve({
                        description: 'Gesichtserkennung fehlgeschlagen. Manuelle Markierung verfügbar.',
                        faces: []
                    });
                }
                
                URL.revokeObjectURL(imageUrl);
            };
            
            img.src = imageUrl;
        });
    }

    showResults(photoBlob, result) {
        document.getElementById('cameraView').style.display = 'none';
        document.getElementById('resultsView').style.display = 'block';
        
        const resultImage = document.getElementById('resultImage');
        resultImage.src = URL.createObjectURL(photoBlob);
        
        // Store original image data
        this.originalImageData = URL.createObjectURL(photoBlob);
        
        document.getElementById('description').textContent = result.description;
        
        this.addManualFaceDetection();
        
        if (result.faces && result.faces.length > 0) {
            this.createBlurredImage(photoBlob, result.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            this.updateFaceInfo(result.faces);
        }
    }

    createBlurredImage(photoBlob, faces) {
        const img = new Image();
        img.onload = () => {
            // Create a canvas for blurring
            const blurCanvas = document.createElement('canvas');
            const blurCtx = blurCanvas.getContext('2d');
            
            blurCanvas.width = img.width;
            blurCanvas.height = img.height;
            
            // Draw original image
            blurCtx.drawImage(img, 0, 0);
            
            // Apply heavy blur to faces
            faces.forEach(face => {
                // Keep original radius size
                const blurRadius = face.radius;
                
                // Apply multiple layers of blur for stronger effect
                for (let layer = 0; layer < 3; layer++) {
                    blurCtx.save();
                    
                    // Create clipping circle
                    blurCtx.beginPath();
                    blurCtx.arc(face.x, face.y, blurRadius, 0, 2 * Math.PI);
                    blurCtx.clip();
                    
                    // Apply heavy pixelation
                    this.applyHeavyPixelation(blurCtx, face.x - blurRadius, face.y - blurRadius, blurRadius * 2, blurRadius * 2, 15 + layer * 5);
                    
                    blurCtx.restore();
                }
                
                // Add additional dark overlay for complete anonymization
                const gradient = blurCtx.createRadialGradient(
                    face.x, face.y, 0,
                    face.x, face.y, blurRadius
                );
                gradient.addColorStop(0, 'rgba(60, 60, 60, 0.8)');
                gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.7)');
                gradient.addColorStop(1, 'rgba(100, 100, 100, 0.5)');
                
                blurCtx.fillStyle = gradient;
                blurCtx.beginPath();
                blurCtx.arc(face.x, face.y, blurRadius, 0, 2 * Math.PI);
                blurCtx.fill();
                
                // Add noise pattern for extra obfuscation (fewer points for smaller radius)
                for (let i = 0; i < 30; i++) {
                    const noiseX = face.x + (Math.random() - 0.5) * blurRadius * 2;
                    const noiseY = face.y + (Math.random() - 0.5) * blurRadius * 2;
                    const distance = Math.sqrt((noiseX - face.x) ** 2 + (noiseY - face.y) ** 2);
                    
                    if (distance <= blurRadius) {
                        blurCtx.fillStyle = `rgba(${Math.random() * 100 + 50}, ${Math.random() * 100 + 50}, ${Math.random() * 100 + 50}, 0.3)`;
                        blurCtx.beginPath();
                        blurCtx.arc(noiseX, noiseY, Math.random() * 8 + 3, 0, 2 * Math.PI);
                        blurCtx.fill();
                    }
                }
            });
            
            // Convert to blob and store
            blurCanvas.toBlob((blurredBlob) => {
                this.blurredImageData = URL.createObjectURL(blurredBlob);
                console.log('Heavy blur effect applied successfully');
            }, 'image/jpeg', 0.9);
        };
        
        img.src = URL.createObjectURL(photoBlob);
    }

    applyHeavyPixelation(ctx, x, y, width, height, pixelSize) {
        // Get image data for the face area
        const imageData = ctx.getImageData(x, y, width, height);
        const data = imageData.data;
        const imgWidth = imageData.width;
        const imgHeight = imageData.height;
        
        // Apply heavy pixelation
        for (let py = 0; py < imgHeight; py += pixelSize) {
            for (let px = 0; px < imgWidth; px += pixelSize) {
                // Get average color of the pixel block
                let r = 0, g = 0, b = 0, a = 0;
                let count = 0;
                
                for (let dy = 0; dy < pixelSize && py + dy < imgHeight; dy++) {
                    for (let dx = 0; dx < pixelSize && px + dx < imgWidth; dx++) {
                        const pixelIndex = ((py + dy) * imgWidth + (px + dx)) * 4;
                        r += data[pixelIndex];
                        g += data[pixelIndex + 1];
                        b += data[pixelIndex + 2];
                        a += data[pixelIndex + 3];
                        count++;
                    }
                }
                
                // Calculate average
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);
                a = Math.floor(a / count);
                
                // Apply average color to entire block
                for (let dy = 0; dy < pixelSize && py + dy < imgHeight; dy++) {
                    for (let dx = 0; dx < pixelSize && px + dx < imgWidth; dx++) {
                        const pixelIndex = ((py + dy) * imgWidth + (px + dx)) * 4;
                        data[pixelIndex] = r;
                        data[pixelIndex + 1] = g;
                        data[pixelIndex + 2] = b;
                        data[pixelIndex + 3] = a;
                    }
                }
            }
        }
        
        // Put the pixelated data back
        ctx.putImageData(imageData, x, y);
    }

    updateFaceInfo(faces) {
        const facesInfo = document.getElementById('facesInfo');
        const faceCount = document.getElementById('faceCount');
        const facesList = document.getElementById('facesList');
        
        faceCount.textContent = faces.length;
        facesList.innerHTML = faces.map((face, index) => 
            `<div class="face-item">Gesicht ${index + 1}: Zentrum (${Math.round(face.x)}, ${Math.round(face.y)}), Radius: ${Math.round(face.radius)}${face.confidence ? `, Konfidenz: ${Math.round(face.confidence * 100)}%` : ''}</div>`
        ).join('');
        
        facesInfo.classList.remove('hidden');
    }

    addManualFaceDetection() {
        const imageSection = document.querySelector('.image-section');
        const existingBtn = imageSection.querySelector('.manual-face-btn');
        if (existingBtn) existingBtn.remove();
        
        const manualBtn = document.createElement('button');
        manualBtn.className = 'btn btn-secondary manual-face-btn';
        manualBtn.textContent = 'Weitere Gesichter markieren';
        manualBtn.onclick = () => this.enableManualFaceDetection();
        
        const toggleBtn = document.getElementById('toggleBlurBtn');
        if (toggleBtn.parentNode === imageSection) {
            imageSection.insertBefore(manualBtn, toggleBtn);
        } else {
            imageSection.appendChild(manualBtn);
        }
    }

    enableManualFaceDetection() {
        const resultImage = document.getElementById('resultImage');
        resultImage.style.cursor = 'crosshair';
        
        resultImage.onclick = (e) => {
            const rect = resultImage.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const scaleX = resultImage.naturalWidth / resultImage.offsetWidth;
            const scaleY = resultImage.naturalHeight / resultImage.offsetHeight;
            
            const face = {
                x: x * scaleX,
                y: y * scaleY,
                radius: Math.min(resultImage.naturalWidth, resultImage.naturalHeight) * 0.08,
                confidence: 1.0
            };
            
            if (!this.analysisResult.faces) {
                this.analysisResult.faces = [];
            }
            this.analysisResult.faces.push(face);
            
            // Recreate blurred image with new face
            this.createBlurredImage(this.currentPhoto, this.analysisResult.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            this.updateFaceInfo(this.analysisResult.faces);
            
            this.showError(`Gesicht ${this.analysisResult.faces.length} markiert!`, 2000);
        };
        
        this.showError('Klicken Sie auf weitere Gesichter im Bild', 3000);
    }

    toggleBlur() {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        const toggleBtn = document.getElementById('toggleBlurBtn');
        
        this.isBlurred = !this.isBlurred;
        
        if (this.isBlurred) {
            // Show blurred version
            if (this.blurredImageData) {
                resultImage.src = this.blurredImageData;
                toggleBtn.textContent = 'Original zeigen';
            } else {
                this.showError('Verwischtes Bild wird noch erstellt...', 2000);
                this.isBlurred = false;
            }
        } else {
            // Show original
            resultImage.src = this.originalImageData;
            toggleBtn.textContent = 'Gesichter verwischen';
        }
        
        // Hide canvas (we're using img src switching instead)
        blurredCanvas.style.display = 'none';
    }

    retakePhoto() {
        this.currentPhoto = null;
        this.analysisResult = null;
        this.isBlurred = false;
        
        // Clean up image URLs
        if (this.originalImageData) {
            URL.revokeObjectURL(this.originalImageData);
            this.originalImageData = null;
        }
        if (this.blurredImageData) {
            URL.revokeObjectURL(this.blurredImageData);
            this.blurredImageData = null;
        }
        
        document.getElementById('resultsView').style.display = 'none';
        document.getElementById('cameraView').style.display = 'flex';
        document.getElementById('toggleBlurBtn').classList.add('hidden');
        document.getElementById('facesInfo').classList.add('hidden');
        
        const resultImage = document.getElementById('resultImage');
        resultImage.src = '';
        
        const blurredCanvas = document.getElementById('blurredCanvas');
        blurredCanvas.getContext('2d').clearRect(0, 0, blurredCanvas.width, blurredCanvas.height);
        
        document.querySelectorAll('.manual-face-btn').forEach(btn => btn.remove());
        resultImage.style.cursor = 'default';
        resultImage.onclick = null;
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

document.addEventListener('DOMContentLoaded', () => {
    new PicAI();
});
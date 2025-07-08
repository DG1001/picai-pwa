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
        
        this.initializeApp();
    }

    async initializeApp() {
        await this.setupCamera();
        await this.loadFaceDetectionModel();
        this.setupEventListeners();
        
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    }

    async loadFaceDetectionModel() {
        try {
            this.showError('Lade Gesichtserkennungsmodell...', 3000);
            
            // Load TensorFlow.js face detection model
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
            const result = await this.detectFacesWithTensorFlow(photoBlob);
            this.analysisResult = result;
            this.showResults(photoBlob, result);
            
        } catch (error) {
            this.showError('Analyse fehlgeschlagen: ' + error.message);
            console.error('Analysis error:', error);
            
            // Fallback to manual detection
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
                        // Use TensorFlow.js BlazeFace model
                        const predictions = await this.faceDetectionModel.estimateFaces(img, false);
                        
                        faces = predictions.map(prediction => {
                            const [x1, y1] = prediction.topLeft;
                            const [x2, y2] = prediction.bottomRight;
                            
                            const centerX = (x1 + x2) / 2;
                            const centerY = (y1 + y2) / 2;
                            const radius = Math.max((x2 - x1), (y2 - y1)) / 2 * 1.2; // 20% larger
                            
                            return {
                                x: centerX,
                                y: centerY,
                                radius: radius,
                                confidence: prediction.probability ? prediction.probability[0] : 1
                            };
                        });
                    }
                    
                    resolve({
                        description: `Foto analysiert (${img.width}x${img.height} Pixel). ` +
                                   `${faces.length} Gesicht${faces.length !== 1 ? 'er' : ''} automatisch erkannt. ` +
                                   'Sie können weitere Gesichter manuell markieren.',
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
        // Hide camera, show results
        document.getElementById('cameraView').style.display = 'none';
        document.getElementById('resultsView').style.display = 'block';
        
        // Display image
        const resultImage = document.getElementById('resultImage');
        resultImage.src = URL.createObjectURL(photoBlob);
        
        // Display description
        document.getElementById('description').textContent = result.description;
        
        // Always show manual face detection option
        this.addManualFaceDetection();
        
        // Handle detected faces
        if (result.faces && result.faces.length > 0) {
            this.setupFaceBlurring(result.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            
            // Show face info
            const facesInfo = document.getElementById('facesInfo');
            const faceCount = document.getElementById('faceCount');
            const facesList = document.getElementById('facesList');
            
            faceCount.textContent = result.faces.length;
            facesList.innerHTML = result.faces.map((face, index) => 
                `<div class="face-item">Gesicht ${index + 1}: Zentrum (${Math.round(face.x)}, ${Math.round(face.y)}), Radius: ${Math.round(face.radius)}${face.confidence ? `, Konfidenz: ${Math.round(face.confidence * 100)}%` : ''}</div>`
            ).join('');
            
            facesInfo.classList.remove('hidden');
        }
    }

    addManualFaceDetection() {
        const imageSection = document.querySelector('.image-section');
        
        // Remove existing manual button
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
            
            // Scale to image coordinates
            const scaleX = resultImage.naturalWidth / resultImage.offsetWidth;
            const scaleY = resultImage.naturalHeight / resultImage.offsetHeight;
            
            const face = {
                x: x * scaleX,
                y: y * scaleY,
                radius: Math.min(resultImage.naturalWidth, resultImage.naturalHeight) * 0.08,
                confidence: 1.0 // Manual detection = 100% confidence
            };
            
            if (!this.analysisResult.faces) {
                this.analysisResult.faces = [];
            }
            this.analysisResult.faces.push(face);
            
            this.setupFaceBlurring(this.analysisResult.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            
            // Update face count
            const faceCount = document.getElementById('faceCount');
            const facesList = document.getElementById('facesList');
            const facesInfo = document.getElementById('facesInfo');
            
            faceCount.textContent = this.analysisResult.faces.length;
            facesList.innerHTML = this.analysisResult.faces.map((face, index) => 
                `<div class="face-item">Gesicht ${index + 1}: Zentrum (${Math.round(face.x)}, ${Math.round(face.y)}), Radius: ${Math.round(face.radius)}${face.confidence ? `, Konfidenz: ${Math.round(face.confidence * 100)}%` : ''}</div>`
            ).join('');
            facesInfo.classList.remove('hidden');
            
            this.showError(`Gesicht ${this.analysisResult.faces.length} markiert!`, 2000);
        };
        
        this.showError('Klicken Sie auf weitere Gesichter im Bild', 3000);
    }

    setupFaceBlurring(faces) {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        
        const setupCanvas = () => {
            // Wait for image to be fully loaded and displayed
            setTimeout(() => {
                const imageRect = resultImage.getBoundingClientRect();
                
                // Set canvas size to match natural image size
                blurredCanvas.width = resultImage.naturalWidth;
                blurredCanvas.height = resultImage.naturalHeight;
                
                // Set canvas display size to match displayed image
                blurredCanvas.style.width = resultImage.offsetWidth + 'px';
                blurredCanvas.style.height = resultImage.offsetHeight + 'px';
                blurredCanvas.style.position = 'absolute';
                blurredCanvas.style.top = '0';
                blurredCanvas.style.left = '0';
                
                console.log('Canvas setup:', {
                    naturalWidth: resultImage.naturalWidth,
                    naturalHeight: resultImage.naturalHeight,
                    displayWidth: resultImage.offsetWidth,
                    displayHeight: resultImage.offsetHeight,
                    facesCount: faces.length
                });
                
                this.createBlurredVersion(resultImage, blurredCanvas, faces);
            }, 100);
        };
        
        if (resultImage.complete && resultImage.naturalWidth > 0) {
            setupCanvas();
        } else {
            resultImage.onload = setupCanvas;
        }
    }

    createBlurredVersion(image, canvas, faces) {
        const ctx = canvas.getContext('2d');
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw original image first
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        console.log('Drawing blurred version with faces:', faces);
        
        // Apply blur to each face
        faces.forEach((face, index) => {
            console.log(`Blurring face ${index + 1}:`, face);
            
            ctx.save();
            
            // Create circular clipping path
            ctx.beginPath();
            ctx.arc(face.x, face.y, face.radius, 0, 2 * Math.PI);
            ctx.clip();
            
            // Apply blur effect
            this.applyBlurEffect(ctx, face.x - face.radius, face.y - face.radius, face.radius * 2, face.radius * 2);
            
            ctx.restore();
        });
        
        console.log('Blur effect applied to canvas');
    }

    applyBlurEffect(ctx, x, y, width, height) {
        const gradient = ctx.createRadialGradient(
            x + width/2, y + height/2, 0,
            x + width/2, y + height/2, width/2
        );
        gradient.addColorStop(0, 'rgba(128, 128, 128, 0.9)');
        gradient.addColorStop(1, 'rgba(64, 64, 64, 0.7)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, width, height);
        
        // Add texture
        for (let i = 0; i < 30; i++) {
            ctx.fillStyle = `rgba(${100 + Math.random() * 100}, ${100 + Math.random() * 100}, ${100 + Math.random() * 100}, 0.1)`;
            ctx.fillRect(
                x + Math.random() * width,
                y + Math.random() * height,
                Math.random() * 8 + 2,
                Math.random() * 8 + 2
            );
        }
    }

    toggleBlur() {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        const toggleBtn = document.getElementById('toggleBlurBtn');
        
        this.isBlurred = !this.isBlurred;
        
        console.log('Toggle blur:', this.isBlurred);
        console.log('Canvas dimensions:', blurredCanvas.width, 'x', blurredCanvas.height);
        console.log('Canvas style:', blurredCanvas.style.width, 'x', blurredCanvas.style.height);
        
        if (this.isBlurred) {
            resultImage.style.display = 'none';
            blurredCanvas.style.display = 'block';
            toggleBtn.textContent = 'Original zeigen';
            
            // Force canvas to be visible
            blurredCanvas.style.visibility = 'visible';
            blurredCanvas.style.opacity = '1';
        } else {
            resultImage.style.display = 'block';
            blurredCanvas.style.display = 'none';
            toggleBtn.textContent = 'Gesichter verwischen';
        }
    }

    retakePhoto() {
        this.currentPhoto = null;
        this.analysisResult = null;
        this.isBlurred = false;
        
        document.getElementById('resultsView').style.display = 'none';
        document.getElementById('cameraView').style.display = 'flex';
        document.getElementById('toggleBlurBtn').classList.add('hidden');
        document.getElementById('facesInfo').classList.add('hidden');
        
        const resultImage = document.getElementById('resultImage');
        if (resultImage.src) {
            URL.revokeObjectURL(resultImage.src);
            resultImage.src = '';
        }
        
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PicAI();
});
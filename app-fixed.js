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
        
        document.getElementById('description').textContent = result.description;
        
        this.addManualFaceDetection();
        
        if (result.faces && result.faces.length > 0) {
            this.setupFaceBlurring(result.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            this.updateFaceInfo(result.faces);
        }
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
            
            this.setupFaceBlurring(this.analysisResult.faces);
            document.getElementById('toggleBlurBtn').classList.remove('hidden');
            this.updateFaceInfo(this.analysisResult.faces);
            
            this.showError(`Gesicht ${this.analysisResult.faces.length} markiert!`, 2000);
        };
        
        this.showError('Klicken Sie auf weitere Gesichter im Bild', 3000);
    }

    setupFaceBlurring(faces) {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        
        // Wait for image to be fully loaded
        const createBlurred = () => {
            console.log('Setting up face blurring...');
            console.log('Image natural size:', resultImage.naturalWidth, 'x', resultImage.naturalHeight);
            console.log('Image display size:', resultImage.offsetWidth, 'x', resultImage.offsetHeight);
            console.log('Faces to blur:', faces);
            
            if (resultImage.naturalWidth === 0 || resultImage.naturalHeight === 0) {
                console.log('Image not ready, retrying...');
                setTimeout(createBlurred, 200);
                return;
            }
            
            // Set canvas size to match image
            blurredCanvas.width = resultImage.naturalWidth;
            blurredCanvas.height = resultImage.naturalHeight;
            
            // Set display size to match image
            blurredCanvas.style.width = resultImage.offsetWidth + 'px';
            blurredCanvas.style.height = resultImage.offsetHeight + 'px';
            blurredCanvas.style.maxWidth = '100%';
            blurredCanvas.style.objectFit = 'contain';
            
            console.log('Canvas size set to:', blurredCanvas.width, 'x', blurredCanvas.height);
            console.log('Canvas display size:', blurredCanvas.style.width, 'x', blurredCanvas.style.height);
            
            this.createBlurredVersion(resultImage, blurredCanvas, faces);
        };
        
        // Always wait a bit to ensure image is rendered
        setTimeout(createBlurred, 300);
    }

    createBlurredVersion(image, canvas, faces) {
        const ctx = canvas.getContext('2d');
        
        // Clear and draw original image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        // Apply simple dark circles over faces
        faces.forEach(face => {
            ctx.save();
            
            // Draw a blurred circle effect
            const gradient = ctx.createRadialGradient(
                face.x, face.y, 0,
                face.x, face.y, face.radius
            );
            gradient.addColorStop(0, 'rgba(128, 128, 128, 0.9)');
            gradient.addColorStop(0.7, 'rgba(100, 100, 100, 0.8)');
            gradient.addColorStop(1, 'rgba(80, 80, 80, 0.6)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(face.x, face.y, face.radius, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add some texture for better blur effect
            for (let i = 0; i < 20; i++) {
                ctx.fillStyle = `rgba(${Math.random() * 100 + 100}, ${Math.random() * 100 + 100}, ${Math.random() * 100 + 100}, 0.1)`;
                ctx.beginPath();
                ctx.arc(
                    face.x + (Math.random() - 0.5) * face.radius * 1.5,
                    face.y + (Math.random() - 0.5) * face.radius * 1.5,
                    Math.random() * 10 + 5,
                    0, 2 * Math.PI
                );
                ctx.fill();
            }
            
            ctx.restore();
        });
        
        console.log('Blurred version created with', faces.length, 'faces');
    }

    pixelateImageData(imageData, pixelSize) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        for (let y = 0; y < height; y += pixelSize) {
            for (let x = 0; x < width; x += pixelSize) {
                // Get the color of the top-left pixel in this block
                const pixelIndex = (y * width + x) * 4;
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];
                const a = data[pixelIndex + 3];
                
                // Apply this color to the entire block
                for (let dy = 0; dy < pixelSize && y + dy < height; dy++) {
                    for (let dx = 0; dx < pixelSize && x + dx < width; dx++) {
                        const blockPixelIndex = ((y + dy) * width + (x + dx)) * 4;
                        data[blockPixelIndex] = r;
                        data[blockPixelIndex + 1] = g;
                        data[blockPixelIndex + 2] = b;
                        data[blockPixelIndex + 3] = a;
                    }
                }
            }
        }
    }

    toggleBlur() {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        const toggleBtn = document.getElementById('toggleBlurBtn');
        
        this.isBlurred = !this.isBlurred;
        
        console.log('Toggling blur to:', this.isBlurred);
        console.log('Canvas exists:', !!blurredCanvas);
        console.log('Canvas size:', blurredCanvas.width, 'x', blurredCanvas.height);
        console.log('Canvas has content:', blurredCanvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] > 0);
        
        if (this.isBlurred) {
            // Show blurred version
            resultImage.style.display = 'none';
            blurredCanvas.style.display = 'block';
            blurredCanvas.style.visibility = 'visible';
            blurredCanvas.style.opacity = '1';
            toggleBtn.textContent = 'Original zeigen';
            
            // Force redraw if canvas is empty
            if (blurredCanvas.width === 0 || blurredCanvas.height === 0) {
                console.log('Canvas is empty, recreating...');
                this.setupFaceBlurring(this.analysisResult.faces);
            }
        } else {
            // Show original
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

document.addEventListener('DOMContentLoaded', () => {
    new PicAI();
});
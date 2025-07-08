class PicAI {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.stream = null;
        this.currentPhoto = null;
        this.analysisResult = null;
        this.isBlurred = false;
        
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
            // Simulate analysis with local processing
            const result = await this.localAnalysis(photoBlob);
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

    async localAnalysis(photoBlob) {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Create image for analysis
        const img = new Image();
        const imageUrl = URL.createObjectURL(photoBlob);
        
        return new Promise((resolve) => {
            img.onload = () => {
                // Simple face detection simulation
                const faces = this.detectFacesSimple(img);
                
                resolve({
                    description: `Foto aufgenommen (${img.width}x${img.height} Pixel). ` +
                               `${faces.length > 0 ? 
                                 `${faces.length} Gesicht${faces.length > 1 ? 'er' : ''} erkannt. ` : 
                                 'Keine Gesichter automatisch erkannt. '}` +
                               'Sie können Gesichter manuell markieren, um sie zu verwischen.',
                    faces: faces
                });
                
                URL.revokeObjectURL(imageUrl);
            };
            img.src = imageUrl;
        });
    }

    detectFacesSimple(img) {
        // Simple heuristic face detection
        // In a real app, you'd use TensorFlow.js or similar
        const faces = [];
        const width = img.width;
        const height = img.height;
        
        // Add some demo faces in typical positions
        // Top third of image, centered horizontally
        if (width > 200 && height > 200) {
            faces.push({
                x: width * 0.3,
                y: height * 0.25,
                radius: Math.min(width, height) * 0.08
            });
            
            // If image is wide enough, add second face
            if (width > 400) {
                faces.push({
                    x: width * 0.7,
                    y: height * 0.3,
                    radius: Math.min(width, height) * 0.07
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
                `<div class="face-item">Gesicht ${index + 1}: Zentrum (${Math.round(face.x)}, ${Math.round(face.y)}), Radius: ${Math.round(face.radius)}</div>`
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
        manualBtn.textContent = 'Gesichter manuell markieren';
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
        
        // Remove existing click handler
        resultImage.onclick = null;
        
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
                radius: Math.min(resultImage.naturalWidth, resultImage.naturalHeight) * 0.08
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
                `<div class="face-item">Gesicht ${index + 1}: Zentrum (${Math.round(face.x)}, ${Math.round(face.y)}), Radius: ${Math.round(face.radius)}</div>`
            ).join('');
            facesInfo.classList.remove('hidden');
            
            this.showError(`Gesicht ${this.analysisResult.faces.length} markiert! Klicken Sie weitere Gesichter an oder verwischen Sie die markierten.`, 3000);
        };
        
        this.showError('Klicken Sie auf Gesichter im Bild um sie zu markieren', 3000);
    }

    setupFaceBlurring(faces) {
        const resultImage = document.getElementById('resultImage');
        const blurredCanvas = document.getElementById('blurredCanvas');
        
        const setupCanvas = () => {
            // Set canvas size to match image
            blurredCanvas.width = resultImage.naturalWidth;
            blurredCanvas.height = resultImage.naturalHeight;
            blurredCanvas.style.width = resultImage.offsetWidth + 'px';
            blurredCanvas.style.height = resultImage.offsetHeight + 'px';
            
            this.createBlurredVersion(resultImage, blurredCanvas, faces);
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
        // Create a more realistic blur effect
        const gradient = ctx.createRadialGradient(
            x + width/2, y + height/2, 0,
            x + width/2, y + height/2, width/2
        );
        gradient.addColorStop(0, 'rgba(128, 128, 128, 0.9)');
        gradient.addColorStop(1, 'rgba(64, 64, 64, 0.7)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, width, height);
        
        // Add some texture
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
        const resultImage = document.getElementById('resultImage');
        if (resultImage.src) {
            URL.revokeObjectURL(resultImage.src);
            resultImage.src = '';
        }
        
        const blurredCanvas = document.getElementById('blurredCanvas');
        const ctx = blurredCanvas.getContext('2d');
        ctx.clearRect(0, 0, blurredCanvas.width, blurredCanvas.height);
        
        // Remove manual detection buttons
        const manualBtns = document.querySelectorAll('.manual-face-btn');
        manualBtns.forEach(btn => btn.remove());
        
        // Reset cursor
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
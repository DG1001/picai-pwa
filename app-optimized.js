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
        
        // Live detection variables
        this.isLiveDetectionActive = false;
        this.liveCanvas = null;
        this.liveCtx = null;
        this.detectionInterval = null;
        this.lastDetectedFaces = [];
        this.currentEffect = 'blur';
        
        // Performance optimization
        this.frameSkipCounter = 0;
        this.maxMemoryUsage = 100 * 1024 * 1024; // 100MB limit
        this.cleanupInterval = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        await this.setupCamera();
        await this.loadFaceDetectionModel();
        this.setupEventListeners();
        this.setupLiveCanvas();
        this.startMemoryMonitoring();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js');
        }
    }

    startMemoryMonitoring() {
        // Clean up memory every 30 seconds
        this.cleanupInterval = setInterval(() => {
            this.performMemoryCleanup();
        }, 30000);
        
        // Monitor page visibility to pause when hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseApp();
            } else {
                this.resumeApp();
            }
        });
    }

    performMemoryCleanup() {
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
        
        // Clean up old image URLs
        if (this.originalImageData) {
            URL.revokeObjectURL(this.originalImageData);
        }
        if (this.blurredImageData) {
            URL.revokeObjectURL(this.blurredImageData);
        }
        
        // Clear canvas contexts
        if (this.liveCtx) {
            this.liveCtx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
        }
        
        console.log('Memory cleanup performed');
    }

    pauseApp() {
        if (this.isLiveDetectionActive) {
            this.stopLiveDetection();
            this.wasLiveActiveBeforePause = true;
        }
        
        // Pause video stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.enabled = false;
            });
        }
    }

    resumeApp() {
        // Resume video stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.enabled = true;
            });
        }
        
        // Restart live detection if it was active
        if (this.wasLiveActiveBeforePause) {
            setTimeout(() => {
                this.startLiveDetection();
                this.wasLiveActiveBeforePause = false;
            }, 1000);
        }
    }

    setupLiveCanvas() {
        // Create overlay canvas for live blur
        this.liveCanvas = document.createElement('canvas');
        this.liveCtx = this.liveCanvas.getContext('2d');
        
        // Optimize canvas settings
        this.liveCtx.imageSmoothingEnabled = false; // Disable smoothing for performance
        
        // Style the canvas to overlay the video
        this.liveCanvas.style.position = 'absolute';
        this.liveCanvas.style.top = '0';
        this.liveCanvas.style.left = '0';
        this.liveCanvas.style.pointerEvents = 'none';
        this.liveCanvas.style.zIndex = '10';
        
        // Add to camera container
        const cameraContainer = document.querySelector('.camera-container');
        cameraContainer.appendChild(this.liveCanvas);
    }

    async loadFaceDetectionModel() {
        try {
            this.showError('Lade Gesichtserkennungsmodell...', 3000);
            await tf.ready();
            
            // Configure TensorFlow for better performance
            tf.env().set('WEBGL_PACK', false);
            tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
            
            this.faceDetectionModel = await blazeface.load();
            this.showError('Gesichtserkennung bereit! Live-Modus verfügbar.', 2000);
            
            this.addLiveDetectionButton();
        } catch (error) {
            console.error('Model loading error:', error);
            this.showError('Gesichtserkennungsmodell konnte nicht geladen werden.');
        }
    }

    addLiveDetectionButton() {
        const effectContainer = document.getElementById('effectSelector');
        
        const effects = [
            { name: 'blur', emoji: '🌫️', label: 'Verwischen' },
            { name: 'smiley', emoji: '😊', label: 'Smiley' },
            { name: 'sunglasses', emoji: '😎', label: 'Sonnenbrille' },
            { name: 'heart_eyes', emoji: '😍', label: 'Herzaugen' },
            { name: 'wink', emoji: '😉', label: 'Zwinkern' },
            { name: 'cool', emoji: '🤩', label: 'Cool' }
        ];
        
        this.currentEffect = 'blur';
        
        effects.forEach(effect => {
            const btn = document.createElement('button');
            btn.className = 'effect-btn';
            btn.textContent = effect.emoji;
            btn.title = effect.label;
            btn.dataset.effect = effect.name;
            
            if (effect.name === 'blur') {
                btn.classList.add('active');
            }
            
            btn.onclick = () => {
                this.currentEffect = effect.name;
                effectContainer.querySelectorAll('.effect-btn').forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                this.showError(`Effekt: ${effect.label}`, 1500);
            };
            
            effectContainer.appendChild(btn);
        });
        
        const liveBtn = document.getElementById('liveBlurBtn');
        liveBtn.onclick = () => this.toggleLiveDetection();
    }

    async setupCamera() {
        try {
            // Request lower resolution for better performance
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 15, max: 30 } // Lower framerate
                }
            });
            this.video.srcObject = this.stream;
            
            this.video.addEventListener('loadedmetadata', () => {
                this.updateLiveCanvasSize();
            });
            
        } catch (error) {
            this.showError('Kamera-Zugriff fehlgeschlagen. Bitte Berechtigung erteilen.');
            console.error('Camera error:', error);
        }
    }

    updateLiveCanvasSize() {
        const videoRect = this.video.getBoundingClientRect();
        
        // Limit canvas size for performance
        const maxWidth = 640;
        const maxHeight = 480;
        
        let canvasWidth = this.video.videoWidth;
        let canvasHeight = this.video.videoHeight;
        
        if (canvasWidth > maxWidth) {
            const scale = maxWidth / canvasWidth;
            canvasWidth = maxWidth;
            canvasHeight = canvasHeight * scale;
        }
        
        if (canvasHeight > maxHeight) {
            const scale = maxHeight / canvasHeight;
            canvasHeight = maxHeight;
            canvasWidth = canvasWidth * scale;
        }
        
        this.liveCanvas.width = canvasWidth;
        this.liveCanvas.height = canvasHeight;
        this.liveCanvas.style.width = videoRect.width + 'px';
        this.liveCanvas.style.height = videoRect.height + 'px';
    }

    toggleLiveDetection() {
        const liveBtn = document.getElementById('liveBlurBtn');
        
        if (this.isLiveDetectionActive) {
            this.stopLiveDetection();
            liveBtn.textContent = 'Live-Effekte';
            liveBtn.classList.remove('active');
        } else {
            this.startLiveDetection();
            liveBtn.textContent = 'Live-Effekte AUS';
            liveBtn.classList.add('active');
        }
    }

    startLiveDetection() {
        if (!this.faceDetectionModel) {
            this.showError('Gesichtserkennungsmodell nicht verfügbar');
            return;
        }

        this.isLiveDetectionActive = true;
        this.updateLiveCanvasSize();
        this.frameSkipCounter = 0;
        
        // Slower detection for better performance (every 500ms)
        this.detectionInterval = setInterval(() => {
            this.detectAndBlurLive();
        }, 500);
        
        this.showError(`Live-Effekte aktiv: ${this.getEffectName()}`, 2000);
    }

    stopLiveDetection() {
        this.isLiveDetectionActive = false;
        
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        
        this.liveCtx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
        this.lastDetectedFaces = [];
        
        // Force cleanup
        this.performMemoryCleanup();
        
        this.showError('Live-Effekte deaktiviert', 2000);
    }

    async detectAndBlurLive() {
        if (!this.isLiveDetectionActive || !this.faceDetectionModel) return;

        // Skip frames for performance
        this.frameSkipCounter++;
        if (this.frameSkipCounter % 2 !== 0) {
            // Use last detected faces for smoother experience
            if (this.lastDetectedFaces.length > 0) {
                this.liveCtx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
                this.applyLiveBlur(this.lastDetectedFaces);
            }
            return;
        }

        try {
            // Create smaller image for detection
            const detectionCanvas = document.createElement('canvas');
            const detectionCtx = detectionCanvas.getContext('2d');
            
            const scale = 0.5; // Use half resolution for detection
            detectionCanvas.width = this.video.videoWidth * scale;
            detectionCanvas.height = this.video.videoHeight * scale;
            
            detectionCtx.drawImage(this.video, 0, 0, detectionCanvas.width, detectionCanvas.height);
            
            const predictions = await this.faceDetectionModel.estimateFaces(detectionCanvas, false);
            
            this.liveCtx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
            
            if (predictions.length > 0) {
                // Scale predictions back up
                const faces = predictions.map(prediction => {
                    const [x1, y1] = prediction.topLeft;
                    const [x2, y2] = prediction.bottomRight;
                    
                    const centerX = ((x1 + x2) / 2) / scale * (this.liveCanvas.width / this.video.videoWidth);
                    const centerY = ((y1 + y2) / 2) / scale * (this.liveCanvas.height / this.video.videoHeight);
                    const radius = (Math.max((x2 - x1), (y2 - y1)) / 2 * 1.1) / scale * (this.liveCanvas.width / this.video.videoWidth);
                    
                    return {
                        x: centerX,
                        y: centerY,
                        radius: radius,
                        confidence: prediction.probability ? prediction.probability[0] : 1
                    };
                });
                
                this.applyLiveBlur(faces);
                this.lastDetectedFaces = faces;
            }
            
        } catch (error) {
            console.error('Live detection error:', error);
            // Don't show error to user, just continue
        }
    }

    applyLiveBlur(faces) {
        faces.forEach(face => {
            switch(this.currentEffect) {
                case 'blur':
                    this.applyBlurEffect(face);
                    break;
                case 'smiley':
                    this.applyEmojiEffect(face, '😊');
                    break;
                case 'sunglasses':
                    this.applyEmojiEffect(face, '😎');
                    break;
                case 'heart_eyes':
                    this.applyEmojiEffect(face, '😍');
                    break;
                case 'wink':
                    this.applyEmojiEffect(face, '😉');
                    break;
                case 'cool':
                    this.applyEmojiEffect(face, '🤩');
                    break;
                default:
                    this.applyBlurEffect(face);
            }
        });
    }

    applyBlurEffect(face) {
        const gradient = this.liveCtx.createRadialGradient(
            face.x, face.y, 0,
            face.x, face.y, face.radius
        );
        gradient.addColorStop(0, 'rgba(60, 60, 60, 0.9)');
        gradient.addColorStop(0.5, 'rgba(80, 80, 80, 0.8)');
        gradient.addColorStop(1, 'rgba(100, 100, 100, 0.6)');
        
        this.liveCtx.fillStyle = gradient;
        this.liveCtx.beginPath();
        this.liveCtx.arc(face.x, face.y, face.radius, 0, 2 * Math.PI);
        this.liveCtx.fill();
    }

    applyEmojiEffect(face, emoji) {
        const gradient = this.liveCtx.createRadialGradient(
            face.x, face.y, 0,
            face.x, face.y, face.radius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
        
        this.liveCtx.fillStyle = gradient;
        this.liveCtx.beginPath();
        this.liveCtx.arc(face.x, face.y, face.radius, 0, 2 * Math.PI);
        this.liveCtx.fill();
        
        const fontSize = face.radius * 1.5;
        this.liveCtx.font = `${fontSize}px Arial`;
        this.liveCtx.textAlign = 'center';
        this.liveCtx.textBaseline = 'middle';
        
        this.liveCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.liveCtx.shadowBlur = 4;
        this.liveCtx.shadowOffsetX = 2;
        this.liveCtx.shadowOffsetY = 2;
        
        this.liveCtx.fillText(emoji, face.x, face.y);
        
        this.liveCtx.shadowColor = 'transparent';
        this.liveCtx.shadowBlur = 0;
        this.liveCtx.shadowOffsetX = 0;
        this.liveCtx.shadowOffsetY = 0;
    }

    getEffectName() {
        const effects = {
            'blur': 'Verwischen',
            'smiley': 'Smiley 😊',
            'sunglasses': 'Sonnenbrille 😎',
            'heart_eyes': 'Herzaugen 😍',
            'wink': 'Zwinkern 😉',
            'cool': 'Cool 🤩'
        };
        return effects[this.currentEffect] || 'Verwischen';
    }

    setupEventListeners() {
        document.getElementById('captureBtn').addEventListener('click', () => this.capturePhoto());
        document.getElementById('retakeBtn').addEventListener('click', () => this.retakePhoto());
        document.getElementById('toggleBlurBtn').addEventListener('click', () => this.toggleBlur());
        
        window.addEventListener('resize', () => {
            if (this.isLiveDetectionActive) {
                setTimeout(() => this.updateLiveCanvasSize(), 100);
            }
        });
        
        // Handle app going to background
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    cleanup() {
        // Stop all intervals
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Stop camera stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
        }
        
        // Clean up URLs
        if (this.originalImageData) {
            URL.revokeObjectURL(this.originalImageData);
        }
        if (this.blurredImageData) {
            URL.revokeObjectURL(this.blurredImageData);
        }
        
        // Dispose TensorFlow resources
        if (this.faceDetectionModel) {
            this.faceDetectionModel.dispose();
        }
    }

    capturePhoto() {
        if (!this.stream) return;

        const wasLiveActive = this.isLiveDetectionActive;
        if (wasLiveActive) {
            this.stopLiveDetection();
        }

        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.ctx.drawImage(this.video, 0, 0);
        
        this.canvas.toBlob(async (blob) => {
            this.currentPhoto = blob;
            await this.analyzePhoto(blob);
            
            if (wasLiveActive) {
                setTimeout(() => {
                    document.getElementById('liveBlurBtn').click();
                }, 1000);
            }
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
        if (this.isLiveDetectionActive) {
            this.stopLiveDetection();
            document.getElementById('liveBlurBtn').textContent = 'Live-Effekte';
            document.getElementById('liveBlurBtn').classList.remove('active');
        }

        document.getElementById('cameraView').style.display = 'none';
        document.getElementById('resultsView').style.display = 'block';
        
        const resultImage = document.getElementById('resultImage');
        resultImage.src = URL.createObjectURL(photoBlob);
        
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
            const blurCanvas = document.createElement('canvas');
            const blurCtx = blurCanvas.getContext('2d');
            
            blurCanvas.width = img.width;
            blurCanvas.height = img.height;
            blurCtx.drawImage(img, 0, 0);
            
            faces.forEach(face => {
                const blurRadius = face.radius;
                
                for (let layer = 0; layer < 3; layer++) {
                    blurCtx.save();
                    blurCtx.beginPath();
                    blurCtx.arc(face.x, face.y, blurRadius, 0, 2 * Math.PI);
                    blurCtx.clip();
                    this.applyHeavyPixelation(blurCtx, face.x - blurRadius, face.y - blurRadius, blurRadius * 2, blurRadius * 2, 15 + layer * 5);
                    blurCtx.restore();
                }
                
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
            
            blurCanvas.toBlob((blurredBlob) => {
                this.blurredImageData = URL.createObjectURL(blurredBlob);
                console.log('Heavy blur effect applied successfully');
            }, 'image/jpeg', 0.9);
        };
        
        img.src = URL.createObjectURL(photoBlob);
    }

    applyHeavyPixelation(ctx, x, y, width, height, pixelSize) {
        const imageData = ctx.getImageData(x, y, width, height);
        const data = imageData.data;
        const imgWidth = imageData.width;
        const imgHeight = imageData.height;
        
        for (let py = 0; py < imgHeight; py += pixelSize) {
            for (let px = 0; px < imgWidth; px += pixelSize) {
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
                
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);
                a = Math.floor(a / count);
                
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
            if (this.blurredImageData) {
                resultImage.src = this.blurredImageData;
                toggleBtn.textContent = 'Original zeigen';
            } else {
                this.showError('Verwischtes Bild wird noch erstellt...', 2000);
                this.isBlurred = false;
            }
        } else {
            resultImage.src = this.originalImageData;
            toggleBtn.textContent = 'Gesichter verwischen';
        }
        
        blurredCanvas.style.display = 'none';
    }

    retakePhoto() {
        if (this.isLiveDetectionActive) {
            this.stopLiveDetection();
        }

        this.currentPhoto = null;
        this.analysisResult = null;
        this.isBlurred = false;
        
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

        const liveBtn = document.getElementById('liveBlurBtn');
        if (liveBtn) {
            liveBtn.textContent = 'Live-Effekte';
            liveBtn.classList.remove('active');
        }
        
        // Force cleanup
        this.performMemoryCleanup();
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
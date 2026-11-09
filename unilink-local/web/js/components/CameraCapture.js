// ==========================================================
// COMPONENTE: CameraCapture — tirar foto ou escolher arquivo
// Reutilizável para TelaCorretiva e TelaPendencia
// Mobile: "Galeria" abre seletor nativo (câmera + galeria)
//         "Câmera" abre modal in-app com getUserMedia (traseira)
// Desktop: ambos usam file picker; "Câmera" abre modal in-app
// ==========================================================
function CameraCapture({ onCapture, onSelectFiles, maxFiles = 5, currentCount = 0, disabled = false, processing = false }) {
    const [showCamera, setShowCamera] = React.useState(false);
    const [stream, setStream] = React.useState(null);
    const [error, setError] = React.useState('');
    const [facingMode, setFacingMode] = React.useState('environment');
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const fileInputRef = React.useRef(null);
    const cameraInputRef = React.useRef(null); // fallback: câmera nativa do aparelho (funciona em HTTP)

    const canUseCamera = !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    const openCamera = async () => {
        setError('');
        if (disabled || processing || currentCount >= maxFiles) return;
        // Sem HTTPS/localhost o navegador bloqueia getUserMedia (navigator.mediaDevices fica undefined).
        // Nesse caso usa a câmera nativa via <input capture>, que funciona em HTTP no celular.
        if (!canUseCamera) {
            if (cameraInputRef.current) cameraInputRef.current.click();
            return;
        }
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            setStream(s);
            setShowCamera(true);
        } catch (e) {
            console.warn('Erro câmera:', e && e.name ? e.name : e);
            setError('Não foi possível acessar a câmera do navegador. Abrindo a câmera do aparelho.');
            if (cameraInputRef.current) cameraInputRef.current.click();
        }
    };

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }
    };

    React.useEffect(() => {
        if (showCamera && videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
        }
    }, [showCamera, stream]);

    const closeCamera = () => {
        stopStream();
        setShowCamera(false);
    };

    React.useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [stream]);

    const switchCamera = async () => {
        const newMode = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(newMode);
        stopStream();
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newMode }, audio: false });
            setStream(s);
        } catch (e) { setError('Erro ao trocar câmera'); }
    };

    const capture = () => {
        if (disabled || processing || currentCount >= maxFiles) {
            setError(`Limite de ${maxFiles} fotos atingido.`);
            return;
        }
        if (!videoRef.current || !canvasRef.current) {
            setError('Não foi possível capturar a foto. Tente novamente.');
            return;
        }
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const w = video.videoWidth || 1280;
        const h = video.videoHeight || 720;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setError('Não foi possível processar a imagem da câmera.');
            return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(blob => {
            if (!blob) {
                setError('Não foi possível gerar a imagem.');
                return;
            }
            const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const url = URL.createObjectURL(file);
            onCapture && onCapture({ file, url });
            closeCamera();
        }, 'image/jpeg', 0.85);
    };

    const handleFileChange = (e) => {
        if (disabled || processing) {
            e.target.value = '';
            return;
        }
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const validFiles = [];
        const invalid = [];
        const hashes = new Set();

        for (const file of files) {
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
            if (hashes.has(fingerprint)) continue;
            hashes.add(fingerprint);

            if (!['jpeg', 'jpg', 'png', 'webp'].includes(ext) && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                invalid.push(`${file.name}: tipo não permitido (apenas JPG, PNG, WEBP)`);
                continue;
            }
            if (file.size > 8 * 1024 * 1024) {
                invalid.push(`${file.name}: excede 8 MB`);
                continue;
            }
            const url = URL.createObjectURL(file);
            validFiles.push({ file, url });
        }

        if (invalid.length) {
            setError(invalid.join('; '));
            window.notifyWarning && window.notifyWarning(invalid.join('; '));
        }

        if (validFiles.length) {
            const restante = Math.max(0, maxFiles - currentCount);
            const paraAdicionar = validFiles.slice(0, restante);
            if (paraAdicionar.length === 0) {
                setError(`Limite de ${maxFiles} arquivos atingido.`);
                window.notifyWarning && window.notifyWarning(`Limite de ${maxFiles} arquivos atingido.`);
            } else {
                onSelectFiles && onSelectFiles(paraAdicionar);
                if (validFiles.length > paraAdicionar.length) {
                    setError(`Só foram adicionados ${paraAdicionar.length} arquivos. Limite restante: ${restante}.`);
                }
            }
        }

        e.target.value = '';
    };

    const openFilePicker = () => {
        if (disabled || processing || currentCount >= maxFiles) return;
        setError('');
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const isDisabled = disabled || processing || currentCount >= maxFiles;

    return (
        <div className="w-full">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>Status de evidências</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300">{currentCount}/{maxFiles}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={isDisabled}
                    className={`flex items-center justify-center gap-2 w-full border border-dashed rounded-md px-3 text-[13px] font-medium transition min-h-[36px] ${isDisabled ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-800 border-slate-200 text-slate-400' : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 bg-white dark:bg-transparent text-slate-600 dark:text-slate-300'}`}
                >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h2l2-3h6l2 3h2a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2z"/><circle cx="12" cy="13" r="3"/></svg>
                    {processing ? 'Processando…' : 'Escolher arquivo'}
                </button>
                <button
                    type="button"
                    onClick={openCamera}
                    disabled={isDisabled}
                    className="btn-primary !min-h-[36px]"
                >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    {processing ? 'Aguarde' : 'Câmera'}
                </button>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleFileChange}
                disabled={isDisabled}
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
                disabled={isDisabled}
            />
            <canvas ref={canvasRef} className="hidden" />
            {error && <p className="text-xs text-[#B3261E] dark:text-red-400 font-medium mt-2">{error}</p>}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-1.5 sm:hidden">"Escolher arquivo" abre galeria ou câmera do sistema; "Câmera" usa a do app</p>

            {showCamera && (ReactDOM.createPortal(
                <div className="fixed inset-0 z-[70] bg-black flex flex-col">
                    <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover sm:object-contain max-h-[100dvh]" />
                        <div className="absolute top-0 inset-x-0 p-3 sm:p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
                            <button type="button" onClick={closeCamera} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center active:scale-95">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            <span className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full">{currentCount}/{maxFiles} fotos</span>
                            <button type="button" onClick={switchCamera} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center active:scale-95">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            </button>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-t from-black/70 to-transparent flex flex-col items-center gap-3">
                            <p className="text-white/90 text-xs font-medium text-center">Enquadre a evidência e toque em Capturar</p>
                            <div className="flex items-center justify-center gap-4 w-full max-w-sm mx-auto">
                                <button type="button" onClick={closeCamera} className="flex-1 bg-white/20 backdrop-blur text-white font-medium py-3 rounded-md">Cancelar</button>
                                <button type="button" onClick={capture} className="flex-1 bg-white text-slate-900 font-medium py-3 rounded-md flex items-center justify-center gap-2">
                                    <span className="w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center"><span className="w-5 h-5 rounded-full bg-slate-900"></span></span>
                                    Capturar
                                </button>
                            </div>
                            <p className="text-white/60 text-[11px]">Foto será salva como JPG • máx 5</p>
                        </div>
                    </div>
                </div>
            ), document.body
            )}
        </div>
    );
}
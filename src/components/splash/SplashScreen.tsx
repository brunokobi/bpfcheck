import { useEffect, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 2;
      });
    }, 50);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
      <div className="text-center space-y-8 animate-fade-in">
        {/* Logo Container */}
        <div className="w-32 h-32 bg-white rounded-3xl shadow-primary mx-auto flex items-center justify-center animate-scale-in">
          <img 
            src="/lovable-uploads/3a9d70a7-3c10-4786-9425-c58a607bc9aa.png" 
            alt="BPF Logo" 
            className="w-24 h-24 object-contain animate-pulse-slow"
          />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-white animate-slide-in">
            BPF Check
          </h1>
          <p className="text-xl text-primary-foreground/90 animate-slide-in" style={{ animationDelay: "0.2s" }}>
            Sistema de Auditoria Sanitária
          </p>
        </div>

        {/* Loading Progress */}
        <div className="w-64 mx-auto space-y-3 animate-slide-in" style={{ animationDelay: "0.4s" }}>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div 
              className="bg-white h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-primary-foreground/80 text-sm">
            Carregando aplicativo... {progress}%
          </p>
        </div>

        {/* Features */}
        <div className="text-primary-foreground/70 text-sm space-y-1 animate-slide-in" style={{ animationDelay: "0.6s" }}>
          <p>✓ Checklist RDC 216/2004</p>
          <p>✓ Relatórios automáticos</p>
          <p>✓ Captura de evidências</p>
        </div>
      </div>
    </div>
  );
};
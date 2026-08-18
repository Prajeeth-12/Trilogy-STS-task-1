import { useEffect, useRef } from 'react';

interface Props {
  volume: number;
  isActive: boolean;
}

export function AudioVisualizer({ volume, isActive }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.classList.contains('dark');
      const brandColor = '37, 99, 235';
      const mutedColor = isDark ? '64, 64, 64' : '212, 212, 212';

      if (!isActive) {
        ctx.strokeStyle = `rgba(${mutedColor}, 0.5)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        animId = requestAnimationFrame(draw);
        return;
      }

      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(${brandColor}, ${0.5 + volume * 0.4})`;

      const amplitude = Math.max(2, volume * 14);
      for (let x = 0; x < w; x++) {
        const envelope = Math.sin((x / w) * Math.PI);
        const y = h / 2 + Math.sin(x * 0.025 + phaseRef.current) * amplitude * envelope;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      phaseRef.current += 0.05 + volume * 0.03;
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [volume, isActive]);

  return <canvas ref={canvasRef} width={860} height={24} className="w-full h-6 rounded" />;
}

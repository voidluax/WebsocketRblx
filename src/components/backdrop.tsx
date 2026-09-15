"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient canvas: a slowly drifting lattice of crossing signal lines,
 * glow nodes and a soft mouse parallax. Rendered behind everything.
 */
export function Backdrop({ intensity = 1 }: { intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

    interface Node {
      x: number;
      y: number;
      r: number;
      phase: number;
      speed: number;
    }
    let nodes: Node[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(46, Math.floor((width * height) / 34000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0004 + Math.random() * 0.0009,
      }));
    };

    const onMouse = (event: MouseEvent) => {
      mouse.tx = event.clientX / width;
      mouse.ty = event.clientY / height;
    };

    const draw = (time: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.03;
      mouse.y += (mouse.ty - mouse.y) * 0.03;
      const parallaxX = (mouse.x - 0.5) * 22;
      const parallaxY = (mouse.y - 0.5) * 22;

      ctx.clearRect(0, 0, width, height);

      // lattice
      const spacing = 88;
      const drift = (time * 0.006) % spacing;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(35, 43, 61, 0.35)";
      ctx.beginPath();
      for (let x = -spacing + drift + parallaxX; x < width + spacing; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height * 0.18, height);
      }
      for (let y = -spacing + drift * 0.6 + parallaxY; y < height + spacing; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + width * 0.045);
      }
      ctx.stroke();

      // signal links + nodes
      for (const node of nodes) {
        node.phase += node.speed * 16;
        const glow = (Math.sin(node.phase) + 1) / 2;
        const px = node.x + parallaxX * (0.5 + node.r * 0.2);
        const py = node.y + parallaxY * (0.5 + node.r * 0.2);

        const gradient = ctx.createRadialGradient(px, py, 0, px, py, node.r * 9);
        gradient.addColorStop(0, `rgba(217, 246, 79, ${0.10 * glow * intensity})`);
        gradient.addColorStop(1, "rgba(217, 246, 79, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, node.r * 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(217, 246, 79, ${0.22 + glow * 0.5 * intensity})`;
        ctx.beginPath();
        ctx.arc(px, py, node.r * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [intensity]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(1100px_500px_at_70%_-10%,rgba(217,246,79,0.06),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_600px_at_10%_110%,rgba(110,231,249,0.05),transparent_60%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
    </div>
  );
}

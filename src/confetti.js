export function startConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
  
    // Устанавливаем размеры canvas, равные размерам окна
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  
    // Массив частиц
    const particles = [];
    const colors = ["#FFC107", "#FF5722", "#4CAF50", "#2196F3", "#9C27B0"];
  
    function createParticle() {
        return {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height - canvas.height,
          size: Math.random() * 5 + 2,
          // Горизонтальная скорость
          speedX: Math.random() * 2 - 1,
          // Вертикальная скорость – уменьшаем, чтобы падение было медленнее
          speedY: Math.random() * 1 + 0.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          opacity: Math.random() * 0.5 + 0.5,
        };
      }
      
  
    // Генерируем начальное количество частиц
    for (let i = 0; i < 150; i++) {
      particles.push(createParticle());
    }
  
    // Основная функция анимации
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Для каждой частицы обновляем позицию и рисуем
      particles.forEach((particle, index) => {
        particle.x += particle.speedX;
        particle.y += particle.speedY;
  
        // Если частица вышла за нижнюю границу, создаем новую вверху
        if (particle.y > canvas.height) {
          particles[index] = createParticle();
        }
  
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      });
      requestAnimationFrame(animate);
    }
  
    animate();
  
    // Обновление размеров при изменении окна
    window.addEventListener("resize", () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }
  
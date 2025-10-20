// Espera o DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    const ctaButton = document.getElementById('cta-button');
    const message = document.getElementById('message');
    
    // Contador de cliques
    let clickCount = 0;
    
    ctaButton.addEventListener('click', function() {
        clickCount++;
        message.textContent = `🎉 Você clicou ${clickCount} vez(es)!`;
        message.style.color = '#27ae60';
        
        // Efeito visual no botão
        ctaButton.style.transform = 'scale(0.95)';
        setTimeout(() => {
            ctaButton.style.transform = 'scale(1)';
        }, 150);
    });
    
    // Smooth scroll para links internos
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Efeito de digitação no título
    const heroTitle = document.querySelector('.hero h2');
    const originalText = heroTitle.textContent;
    heroTitle.textContent = '';
    let i = 0;
    
    function typeWriter() {
        if (i < originalText.length) {
            heroTitle.textContent += originalText.charAt(i);
            i++;
            setTimeout(typeWriter, 100);
        }
    }
    
    // Inicia o efeito de digitação
    setTimeout(typeWriter, 1000);
});
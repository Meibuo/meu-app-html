let currentUser = null;
let registrosHoje = [];
let userProfileData = {
    nome: '',
    email: '',
    telefone: '(11) 99999-9999',
    cargo: 'Analista',
    foto: null
};

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    const userData = sessionStorage.getItem('currentUser');
    
    if (!userData) {
        window.location.href = '/login';
        return;
    }
    
    try {
        currentUser = JSON.parse(userData);
        
        // Carregar dados do perfil
        await loadUserProfile();
        
        // Configurar interface
        updateUserInterface();
        
        // Carregar dados
        await loadDashboard();
        startClock();
        
        // Verificar notificações
        checkNotifications();
        
    } catch (error) {
        console.error('Erro:', error);
        showError('Erro ao carregar dados');
        setTimeout(() => window.location.href = '/login', 2000);
    }
});

async function loadUserProfile() {
    // Simular carregamento do servidor
    // Na prática, você faria uma requisição para a API
    userProfileData = {
        nome: currentUser.nome,
        email: currentUser.email,
        telefone: userProfileData.telefone,
        cargo: userProfileData.cargo,
        foto: localStorage.getItem('userPhoto')
    };
}

function updateUserInterface() {
    // Atualizar header
    document.getElementById('userName').textContent = userProfileData.nome;
    document.getElementById('userCargo').textContent = userProfileData.cargo;
    
    // Atualizar modal
    document.getElementById('modalUserName').textContent = userProfileData.nome;
    document.getElementById('modalUserCargo').textContent = `Cargo: ${userProfileData.cargo}`;
    document.getElementById('displayNome').textContent = userProfileData.nome;
    document.getElementById('displayEmail').textContent = userProfileData.email;
    document.getElementById('displayTelefone').textContent = userProfileData.telefone;
    
    // Atualizar avatar
    updateAvatar();
}

function updateAvatar() {
    const avatarImg = document.getElementById('userAvatarImg');
    const avatarText = document.getElementById('userAvatarText');
    const modalAvatarImg = document.getElementById('modalUserAvatarImg');
    const modalAvatarText = document.getElementById('modalUserAvatarText');
    
    if (userProfileData.foto) {
        avatarImg.src = userProfileData.foto;
        avatarImg.style.display = 'block';
        avatarText.style.display = 'none';
        
        modalAvatarImg.src = userProfileData.foto;
        modalAvatarImg.style.display = 'block';
        modalAvatarText.style.display = 'none';
    } else {
        avatarImg.style.display = 'none';
        avatarText.style.display = 'block';
        avatarText.textContent = userProfileData.nome.charAt(0).toUpperCase();
        
        modalAvatarImg.style.display = 'none';
        modalAvatarText.style.display = 'block';
        modalAvatarText.textContent = userProfileData.nome.charAt(0).toUpperCase();
    }
}

// Funções do Relógio
function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = 
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('currentDate').textContent = 
        now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Funções do Dashboard
async function loadDashboard() {
    try {
        // Simular carregamento de dados
        const response = await fetch('/api/registros/hoje', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (!response.ok) throw new Error('Erro ao carregar registros');
        
        const data = await response.json();
        registrosHoje = data.registros;
        
        updateRegistrosList();
        updateStats();
        updateStatus();
        
    } catch (error) {
        console.error('Erro:', error);
        // Simular dados para demonstração
        registrosHoje = [
            { tipo: 'entrada', horario: '08:00', data: new Date().toISOString() },
            { tipo: 'saida', horario: '12:00', data: new Date().toISOString() },
            { tipo: 'entrada', horario: '13:00', data: new Date().toISOString() }
        ];
        
        updateRegistrosList();
        updateStats();
        updateStatus();
    }
}

function updateRegistrosList() {
    const registrosList = document.getElementById('registrosList');
    
    if (registrosHoje.length === 0) {
        registrosList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clock"></i>
                <h3>Nenhum registro hoje</h3>
                <p>Seus registros de ponto aparecerão aqui</p>
            </div>
        `;
        return;
    }
    
    registrosList.innerHTML = registrosHoje.map(registro => `
        <div class="registro-item">
            <div class="registro-info">
                <div class="registro-icon ${registro.tipo}-icon">
                    <i class="fas fa-${registro.tipo === 'entrada' ? 'sign-in-alt' : 'sign-out-alt'}"></i>
                </div>
                <div class="registro-details">
                    <div class="registro-tipo">${registro.tipo === 'entrada' ? 'Entrada' : 'Saída'}</div>
                    <div class="registro-data">${new Date(registro.data).toLocaleDateString('pt-BR')}</div>
                </div>
            </div>
            <div class="registro-hora">${registro.horario}</div>
        </div>
    `).join('');
}

function updateStats() {
    const entradas = registrosHoje.filter(r => r.tipo === 'entrada').length;
    const saidas = registrosHoje.filter(r => r.tipo === 'saida').length;
    
    document.getElementById('totalEntradas').textContent = entradas;
    document.getElementById('totalSaidas').textContent = saidas;
    document.getElementById('totalIntervalos').textContent = Math.min(entradas, saidas);
    
    // Calcular horas trabalhadas (simulação)
    const horasTrabalhadas = calcularHorasTrabalhadas();
    document.getElementById('horasTrabalhadas').textContent = horasTrabalhadas;
}

function calcularHorasTrabalhadas() {
    // Simulação de cálculo de horas
    if (registrosHoje.length < 2) return '0h 00m';
    
    let totalMinutos = 0;
    let entradaAtual = null;
    
    for (const registro of registrosHoje) {
        if (registro.tipo === 'entrada') {
            entradaAtual = registro;
        } else if (registro.tipo === 'saida' && entradaAtual) {
            const entrada = new Date(entradaAtual.data);
            const saida = new Date(registro.data);
            totalMinutos += (saida - entrada) / (1000 * 60);
            entradaAtual = null;
        }
    }
    
    const horas = Math.floor(totalMinutos / 60);
    const minutos = Math.floor(totalMinutos % 60);
    
    return `${horas}h ${minutos.toString().padStart(2, '0')}m`;
}

function updateStatus() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (registrosHoje.length === 0) {
        statusDot.className = 'status-dot inativo';
        statusText.textContent = 'Aguardando primeiro registro';
        return;
    }
    
    const ultimoRegistro = registrosHoje[registrosHoje.length - 1];
    
    if (ultimoRegistro.tipo === 'entrada') {
        statusDot.className = 'status-dot ativo';
        statusText.textContent = 'Trabalhando';
    } else {
        statusDot.className = 'status-dot inativo';
        statusText.textContent = 'Fora do trabalho';
    }
}

// Funções de Registro de Ponto
async function registrarPonto(tipo) {
    try {
        // Verificar permissão de localização
        if (!await checkLocationPermission()) {
            showError('Permissão de localização necessária para registrar ponto');
            return;
        }
        
        // Obter localização
        const location = await getCurrentLocation();
        
        // Registrar ponto
        const response = await fetch('/api/registros', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
                tipo: tipo,
                localizacao: location
            })
        });
        
        if (!response.ok) throw new Error('Erro ao registrar ponto');
        
        const resultado = await response.json();
        
        showSuccess(`Ponto registrado com sucesso às ${resultado.horario}`);
        await loadDashboard();
        
    } catch (error) {
        console.error('Erro:', error);
        showError('Erro ao registrar ponto. Tente novamente.');
    }
}

async function checkLocationPermission() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(false);
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => resolve(false),
            { timeout: 5000 }
        );
    });
}

async function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            position => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            }),
            error => reject(error),
            { 
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}

// Funções do Modal de Perfil
function openProfileModal() {
    document.getElementById('profileModal').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
    // Resetar formulários de edição
    cancelAllEdits();
    document.getElementById('passwordForm').style.display = 'none';
}

// Funções de Edição de Perfil
function startEdit(campo) {
    // Cancelar outras edições
    cancelAllEdits();
    
    const item = document.getElementById(`${campo}Item`);
    const display = document.getElementById(`display${campo.charAt(0).toUpperCase() + campo.slice(1)}`);
    const input = document.getElementById(`edit${campo.charAt(0).toUpperCase() + campo.slice(1)}`);
    const editBtn = item.querySelector('.edit-btn');
    const saveBtn = item.querySelector('.save-btn');
    const cancelBtn = item.querySelector('.cancel-btn');
    
    // Configurar valor do input
    input.value = display.textContent;
    
    // Mostrar/ocultar elementos
    display.style.display = 'none';
    input.style.display = 'block';
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    
    // Focar no input
    input.focus();
}

function cancelEdit(campo) {
    const item = document.getElementById(`${campo}Item`);
    const display = document.getElementById(`display${campo.charAt(0).toUpperCase() + campo.slice(1)}`);
    const input = document.getElementById(`edit${campo.charAt(0).toUpperCase() + campo.slice(1)}`);
    const editBtn = item.querySelector('.edit-btn');
    const saveBtn = item.querySelector('.save-btn');
    const cancelBtn = item.querySelector('.cancel-btn');
    
    // Restaurar estado
    display.style.display = 'block';
    input.style.display = 'none';
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
}

function cancelAllEdits() {
    ['nome', 'email', 'telefone'].forEach(campo => {
        const item = document.getElementById(`${campo}Item`);
        if (item) {
            const display = document.getElementById(`display${campo.charAt(0).toUpperCase() + campo.slice(1)}`);
            const input = document.getElementById(`edit${campo.charAt(0).toUpperCase() + campo.slice(1)}`);
            const editBtn = item.querySelector('.edit-btn');
            const saveBtn = item.querySelector('.save-btn');
            const cancelBtn = item.querySelector('.cancel-btn');
            
            if (display && input && editBtn && saveBtn && cancelBtn) {
                display.style.display = 'block';
                input.style.display = 'none';
                editBtn.style.display = 'inline-block';
                saveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
            }
        }
    });
}

async function saveNome() {
    const novoNome = document.getElementById('editNome').value.trim();
    
    if (!novoNome) {
        showError('Nome não pode estar vazio');
        return;
    }
    
    try {
        // Simular salvamento no servidor
        userProfileData.nome = novoNome;
        localStorage.setItem('userProfile', JSON.stringify(userProfileData));
        
        // Atualizar interface
        document.getElementById('displayNome').textContent = novoNome;
        document.getElementById('userName').textContent = novoNome;
        document.getElementById('modalUserName').textContent = novoNome;
        updateAvatar();
        
        cancelEdit('nome');
        showSuccess('Nome atualizado com sucesso');
        
    } catch (error) {
        console.error('Erro:', error);
        showError('Erro ao atualizar nome');
    }
}

async function saveEmail() {
    const novoEmail = document.getElementById('editEmail').value.trim();
    
    if (!novoEmail || !isValidEmail(novoEmail)) {
        showError('E-mail inválido');
        return;
    }
    
    try {
        // Simular salvamento no servidor
        userProfileData.email = novoEmail;
        localStorage.setItem('userProfile', JSON.stringify(userProfileData));
        
        // Atualizar interface
        document.getElementById('displayEmail').textContent = novoEmail;
        
        cancelEdit('email');
        showSuccess('E-mail atualizado com sucesso');
        
    } catch (error) {
        console.error('Erro:', error);
        showError('Erro ao atualizar e-mail');
    }
}

async function saveTelefone() {
    const novoTelefone = document.getElementById('editTelefone').value.trim();
    
    if (!novoTelefone) {
        showError('Telefone não pode estar vazio');
        return;
    }
    
    try {
        // Simular salvamento no servidor
        userProfileData.telefone = novoTelefone;
        localStorage.setItem('userProfile', JSON.stringify(userProfileData));
        
        // Atualizar interface
        document.getElementById('displayTelefone').textContent = novoTelefone;
        
        cancelEdit('telefone');
        showSuccess('Telefone atualizado com sucesso');
        
    } catch (error) {
        console.error('Erro:', error);
        showError('Erro ao atualizar telefone');
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Funções de Alteração de Senha
function togglePasswordForm() {
    const form = document.getElementById('passwordForm');
    form.style.display = form.style.display === 'block' ? 'none' : 'block';
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showError('Preencha todos os campos');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showError('As senhas não coincidem');
        return;
    }
    
    if (newPassword.length < 6) {
        showError('A nova senha deve ter pelo menos 6 caracteres');
        return;
    }
    
    try {
        // Simular alteração de senha
        const response = await fetch('/api/alterar-senha', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            },
            body: JSON.stringify({
                senhaAtual: currentPassword,
                novaSenha: newPassword
            })
        });
        
        if (!response.ok) throw new Error('Erro ao alterar senha');
        
        // Limpar formulário
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        togglePasswordForm();
        showSuccess('Senha alterada com sucesso');
        
    } catch (error) {
        console.error('Erro:', error);
        showError('Erro ao alterar senha. Verifique a senha atual.');
    }
}

// Upload de Foto
function handlePhotoUpload(event) {
    const file = event.target.files[0];
    
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showError('Por favor, selecione uma imagem');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB
        showError('A imagem deve ter no máximo 5MB');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        // Criar canvas para redimensionar a imagem
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Definir tamanho máximo
            const maxSize = 300;
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxSize) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Desenhar imagem redimensionada
            ctx.drawImage(img, 0, 0, width, height);
            
            // Obter URL da imagem redimensionada
            const resizedImageUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            // Salvar imagem
            userProfileData.foto = resizedImageUrl;
            localStorage.setItem('userPhoto', resizedImageUrl);
            localStorage.setItem('userProfile', JSON.stringify(userProfileData));
            
            // Atualizar avatares
            updateAvatar();
            
            showSuccess('Foto atualizada com sucesso');
        };
        
        img.src = e.target.result;
    };
    
    reader.readAsDataURL(file);
}

// Funções de Notificação
async function checkNotifications() {
    try {
        const response = await fetch('/api/notificacoes', {
            headers: { 'Authorization': `Bearer ${currentUser.token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const notificacoesNaoLidas = data.filter(n => !n.lida).length;
            
            if (notificacoesNaoLidas > 0) {
                document.getElementById('notificationBadge').textContent = notificacoesNaoLidas;
                document.getElementById('notificationBadge').style.display = 'flex';
            } else {
                document.getElementById('notificationBadge').style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Erro ao verificar notificações:', error);
    }
}

function toggleNotifications() {
    // Simular abertura de notificações
    showSuccess('Notificações carregadas');
    // Aqui você implementaria a lógica para mostrar as notificações
}

// Funções Auxiliares
function showSection(section) {
    showSuccess(`Abrindo ${section}`);
    // Implementar navegação para as seções
}

function logout() {
    if (confirm('Deseja realmente sair do sistema?')) {
        sessionStorage.removeItem('currentUser');
        window.location.href = '/login';
    }
}

function showSuccess(message) {
    const alert = document.getElementById('successAlert');
    document.getElementById('successText').textContent = message;
    alert.style.display = 'flex';
    
    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

function showError(message) {
    const alert = document.getElementById('errorAlert');
    document.getElementById('errorText').textContent = message;
    alert.style.display = 'flex';
    
    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    const modal = document.getElementById('profileModal');
    if (event.target === modal) {
        closeProfileModal();
    }
}
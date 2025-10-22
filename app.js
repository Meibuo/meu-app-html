// Sistema de Ponto - Frontend JavaScript
// Configuração
const CONFIG = {
    API_BASE_URL: '/api'
};

// Estado da aplicação
let currentUser = null;

// Utilitários
const utils = {
    // Validar email
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),

    // Formatar telefone
    formatTelefone: (telefone) => {
        if (!telefone) return '';
        const numbers = telefone.replace(/\D/g, '');
        if (numbers.length === 11) {
            return `(${numbers.substring(0,2)}) ${numbers.substring(2,7)}-${numbers.substring(7)}`;
        } else if (numbers.length === 10) {
            return `(${numbers.substring(0,2)}) ${numbers.substring(2,6)}-${numbers.substring(6)}`;
        }
        return telefone;
    },

    // Formatar data
    formatDate: (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    },

    // Obter iniciais do nome
    getIniciais: (nome) => {
        if (!nome) return '??';
        return nome.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    }
};

// API Service - SEM TOKEN
const apiService = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE_URL}${endpoint}`;
        
        const config = {
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Erro na requisição:', error);
            throw error;
        }
    },

    // Métodos de autenticação
    async login(email, senha) {
        return this.request('/login', {
            method: 'POST',
            body: { email, senha }
        });
    },

    // Métodos de perfil
    async atualizarPerfil(dados) {
        return this.request('/perfil', {
            method: 'PUT',
            body: dados
        });
    },

    async alterarSenha(dados) {
        return this.request('/alterar-senha', {
            method: 'PUT',
            body: dados
        });
    },

    async uploadAvatar(formData) {
        const response = await fetch('/api/upload-avatar', {
            method: 'POST',
            body: formData
        });
        return await response.json();
    },

    // Métodos de administração
    async listarUsuarios(usuario_id) {
        return this.request(`/admin/usuarios?usuario_id=${usuario_id}`);
    },

    async cadastrarUsuario(dados) {
        return this.request('/cadastro', {
            method: 'POST',
            body: dados
        });
    }
};

// Sistema de Notificações
const notificationManager = {
    show(message, type = 'success', duration = 5000) {
        let alert = document.getElementById('dynamicAlert');
        if (!alert) {
            alert = document.createElement('div');
            alert.id = 'dynamicAlert';
            alert.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                color: white;
                z-index: 10000;
                max-width: 300px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            document.body.appendChild(alert);
        }

        const colors = {
            success: '#2ecc71',
            error: '#e74c3c',
            warning: '#f39c12',
            info: '#3498db'
        };

        alert.textContent = message;
        alert.style.background = colors[type] || colors.success;
        alert.style.display = 'block';
        alert.style.opacity = '1';

        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => {
                alert.style.display = 'none';
            }, 300);
        }, duration);
    },

    showSuccess(message) {
        this.show(message, 'success');
    },

    showError(message) {
        this.show(message, 'error');
    },

    showWarning(message) {
        this.show(message, 'warning');
    }
};

// Gerenciamento de Autenticação - SEM TOKEN
const authManager = {
    async initialize() {
        const userData = localStorage.getItem('currentUser');
        
        if (!userData) {
            return false;
        }
        
        try {
            currentUser = JSON.parse(userData);
            return true;
        } catch (error) {
            console.error('Erro ao carregar usuário:', error);
            this.logout();
            return false;
        }
    },

    async login(email, senha) {
        try {
            const result = await apiService.login(email, senha);
            
            if (result.success) {
                localStorage.setItem('currentUser', JSON.stringify(result.user));
                currentUser = result.user;
                
                notificationManager.showSuccess(result.message);
                return { success: true, user: result.user };
            } else {
                notificationManager.showError(result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            notificationManager.showError('Erro de conexão. Tente novamente.');
            return { success: false, error: 'Erro de conexão' };
        }
    },

    logout() {
        localStorage.removeItem('currentUser');
        currentUser = null;
        window.location.href = '/login';
    },

    getCurrentUser() {
        return currentUser;
    },

    isAdmin() {
        return currentUser && currentUser.isAdmin;
    }
};

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await initializeApp();
    } catch (error) {
        console.error('Falha na inicialização:', error);
    }
});

async function initializeApp() {
    // Verificar se está na página de login
    if (window.location.pathname === '/login' || window.location.pathname === '/') {
        return;
    }

    // Verificar autenticação
    const isAuthenticated = await authManager.initialize();
    
    if (!isAuthenticated) {
        window.location.href = '/login';
        return;
    }

    // Configurar interface baseada no usuário
    updateUserInterface();
    
    // Iniciar relógio se existir na página
    if (document.querySelector('[data-clock]')) {
        startClock();
    }

    // Configurar event listeners globais
    setupGlobalEventListeners();
}

function updateUserInterface() {
    if (!currentUser) return;

    // Atualizar elementos da UI com dados do usuário
    const userNameElements = document.querySelectorAll('.user-name, [data-user-name]');
    userNameElements.forEach(el => {
        if (el.tagName === 'INPUT') {
            el.value = currentUser.nome;
        } else {
            el.textContent = currentUser.nome;
        }
    });

    const userRoleElements = document.querySelectorAll('.user-cargo, [data-user-role]');
    userRoleElements.forEach(el => {
        el.textContent = currentUser.cargo || 'Funcionário';
    });

    const userAvatarElements = document.querySelectorAll('.user-avatar, .profile-avatar');
    userAvatarElements.forEach(el => {
        if (currentUser.avatar) {
            el.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.nome}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            const iniciais = utils.getIniciais(currentUser.nome);
            el.innerHTML = `<span style="font-weight: bold;">${iniciais}</span>`;
        }
    });

    // Mostrar/ocultar elementos de admin
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        el.style.display = currentUser.isAdmin ? 'block' : 'none';
    });

    // Atualizar informações de perfil
    const emailElements = document.querySelectorAll('[data-user-email]');
    emailElements.forEach(el => {
        el.textContent = currentUser.email;
    });

    const telefoneElements = document.querySelectorAll('[data-user-telefone]');
    telefoneElements.forEach(el => {
        el.textContent = currentUser.telefone || 'Não informado';
    });
}

function startClock() {
    function updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR');
        const dateString = now.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        const clockElements = document.querySelectorAll('[data-clock]');
        clockElements.forEach(el => {
            el.textContent = timeString;
        });
        
        const dateElements = document.querySelectorAll('[data-date]');
        dateElements.forEach(el => {
            el.textContent = dateString;
        });
    }
    
    updateClock();
    setInterval(updateClock, 1000);
}

function setupGlobalEventListeners() {
    // Logout global
    const logoutButtons = document.querySelectorAll('[data-logout]');
    logoutButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            authManager.logout();
        });
    });

    // Fechar modais ao clicar fora
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });

    // Tecla Escape para fechar modais
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                modal.style.display = 'none';
            });
        }
    });
}

// Funções globais para uso em outras páginas
window.app = {
    utils,
    apiService,
    authManager,
    notificationManager,
    getCurrentUser: () => currentUser
};

// Função global de logout
window.logout = authManager.logout;

// Função global para verificar autenticação
window.checkAuth = () => {
    const user = localStorage.getItem('currentUser');
    if (!user && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
    }
};
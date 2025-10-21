// Configuração
const CONFIG = {
    API_BASE_URL: '/api',
    MAX_PHOTO_SIZE: 5 * 1024 * 1024, // 5MB
    PHOTO_QUALITY: 0.8,
    PHOTO_MAX_SIZE: 300,
    REQUEST_TIMEOUT: 10000
};

// Estado da aplicação
let currentUser = null;
let registrosHoje = [];

// Utilitários
const utils = {
    // Verificar se está em desenvolvimento
    isDevelopment: () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',

    // Validar email
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),

    // Formatar telefone
    formatTelefone: (telefone) => {
        const numbers = telefone.replace(/\D/g, '');
        if (numbers.length === 11) {
            return `(${numbers.substring(0,2)}) ${numbers.substring(2,7)}-${numbers.substring(7)}`;
        } else if (numbers.length === 10) {
            return `(${numbers.substring(0,2)}) ${numbers.substring(2,6)}-${numbers.substring(6)}`;
        }
        return telefone;
    },

    // Debounce para otimização
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// API Service
const apiService = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE_URL}${endpoint}`;
        const token = localStorage.getItem('authToken');
        
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            timeout: CONFIG.REQUEST_TIMEOUT,
            ...options
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
            
            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (response.status === 401) {
                this.handleAuthError();
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    },

    handleAuthError() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    },

    // Métodos específicos
    async getRegistrosHoje() {
        if (!currentUser) throw new Error('Usuário não autenticado');
        return this.request(`/registros/${currentUser.id}`);
    },

    async registrarPonto(dados) {
        return this.request('/registrar-ponto', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    },

    async alterarSenha(dados) {
        return this.request('/alterar-senha', {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
    },

    // Mock data para desenvolvimento
    getMockRegistros() {
        return {
            registros: [
                { 
                    tipo: 'entrada', 
                    horario: '08:00', 
                    data: new Date().toISOString(),
                    timestamp: new Date().setHours(8, 0, 0)
                }
            ]
        };
    }
};

// Sistema de Notificações UI
const notificationManager = {
    show(message, type = 'success', duration = 5000) {
        // Criar elemento de alerta dinâmico se não existir
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
            `;
            document.body.appendChild(alert);
        }

        const colors = {
            success: '#2ecc71',
            error: '#e74c3c',
            warning: '#f39c12'
        };

        alert.textContent = message;
        alert.style.background = colors[type] || colors.success;
        alert.style.display = 'block';

        setTimeout(() => {
            alert.style.display = 'none';
        }, duration);
    },

    showSuccess(message) {
        this.show(message, 'success');
    },

    showError(message) {
        this.show(message, 'error');
    }
};

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await initializeApp();
    } catch (error) {
        console.error('Falha na inicialização:', error);
        notificationManager.showError('Erro ao carregar aplicação');
    }
});

async function initializeApp() {
    // Verificar autenticação
    if (!await checkAuthentication()) {
        return;
    }

    // Configurar interface
    updateUserInterface();
    
    // Iniciar serviços
    startClock();
    await loadDashboard();

    // Configurar event listeners
    setupEventListeners();
}

async function checkAuthentication() {
    const userData = localStorage.getItem('currentUser');
    const token = localStorage.getItem('authToken');
    
    if (!userData || !token) {
        window.location.href = '/login.html';
        return false;
    }
    
    try {
        currentUser = JSON.parse(userData);
        
        // Validar estrutura básica do usuário
        if (!currentUser?.id || !currentUser?.nome) {
            throw new Error('Dados de usuário inválidos');
        }
        
        return true;
        
    } catch (error) {
        console.error('Erro na autenticação:', error);
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
        return false;
    }
}

function updateUserInterface() {
    // Atualizar elementos da UI com dados do usuário
    const userNameElements = document.querySelectorAll('[data-user-name]');
    userNameElements.forEach(el => {
        el.textContent = currentUser.nome;
    });

    const userRoleElements = document.querySelectorAll('[data-user-role]');
    userRoleElements.forEach(el => {
        el.textContent = currentUser.cargo || 'Funcionário';
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

async function loadDashboard() {
    try {
        const data = await apiService.getRegistrosHoje();
        if (data.success) {
            registrosHoje = data.registros;
            updateRegistrosList();
        }
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

function updateRegistrosList() {
    // Implementar atualização da lista de registros
    console.log('Registros atualizados:', registrosHoje);
}

function setupEventListeners() {
    // Fechar modal ao clicar fora
    window.addEventListener('click', (event) => {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Teclas de atalho
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                modal.style.display = 'none';
            });
        }
    });
}

// Funções globais
function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
}

// Exportar para uso global
window.app = {
    utils,
    apiService,
    notificationManager,
    logout
};
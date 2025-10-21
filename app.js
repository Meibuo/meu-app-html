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
let userProfileData = {
    nome: '',
    email: '',
    telefone: '(11) 99999-9999',
    cargo: 'Analista',
    foto: null
};

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
        const config = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser?.token}`
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

    // Métodos específicos
    async getRegistrosHoje() {
        if (utils.isDevelopment()) {
            // Mock data para desenvolvimento
            return this.getMockRegistros();
        }
        return this.request('/registros/hoje');
    },

    async registrarPonto(dados) {
        if (utils.isDevelopment()) {
            // Mock para desenvolvimento
            return this.mockRegistroPonto(dados);
        }
        return this.request('/registros', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    },

    async alterarSenha(dados) {
        return this.request('/alterar-senha', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
    },

    async getNotificacoes() {
        if (utils.isDevelopment()) {
            return this.getMockNotificacoes();
        }
        return this.request('/notificacoes');
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
                },
                { 
                    tipo: 'saida', 
                    horario: '12:00', 
                    data: new Date().toISOString(),
                    timestamp: new Date().setHours(12, 0, 0)
                },
                { 
                    tipo: 'entrada', 
                    horario: '13:00', 
                    data: new Date().toISOString(),
                    timestamp: new Date().setHours(13, 0, 0)
                }
            ]
        };
    },

    mockRegistroPonto(dados) {
        return {
            success: true,
            message: 'Ponto registrado com sucesso',
            horario: new Date().toLocaleTimeString('pt-BR'),
            timestamp: new Date().getTime()
        };
    },

    getMockNotificacoes() {
        return [
            {
                id: 1,
                titulo: 'Bem-vindo ao sistema',
                mensagem: 'Seu cadastro foi ativado com sucesso',
                lida: false,
                data: new Date().toISOString()
            }
        ];
    }
};

// Sistema de Notificações UI
const notificationManager = {
    show(message, type = 'success', duration = 5000) {
        const alert = document.getElementById(`${type}Alert`);
        const textElement = document.getElementById(`${type}Text`);
        
        if (!alert || !textElement) return;

        textElement.textContent = message;
        alert.style.display = 'flex';

        setTimeout(() => {
            alert.style.display = 'none';
        }, duration);
    },

    showSuccess(message) {
        this.show(message, 'success');
    },

    showError(message) {
        this.show(message, 'error');
    },

    showLoading(message = 'Carregando...') {
        // Implementar overlay de loading se necessário
        console.log('Loading:', message);
    },

    hideLoading() {
        // Esconder overlay de loading
        console.log('Loading complete');
    }
};

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await initializeApp();
    } catch (error) {
        console.error('Falha na inicialização:', error);
        notificationManager.showError('Erro ao carregar aplicação');
        setTimeout(() => {
            window.location.href = '/login';
        }, 3000);
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
    await checkNotifications();

    // Configurar event listeners
    setupEventListeners();
}

async function checkAuthentication() {
    const userData = sessionStorage.getItem('currentUser');
    
    if (!userData) {
        window.location.href = '/login';
        return false;
    }
    
    try {
        currentUser = JSON.parse(userData);
        
        // Validar estrutura básica do usuário
        if (!currentUser?.id || !currentUser?.nome) {
            throw new Error('Dados de usuário inválidos');
        }
        
        await loadUserProfile();
        return true;
        
    } catch (error) {
        console.error('Erro na autenticação:', error);
        sessionStorage.removeItem('currentUser');
        window.location.href = '/login';
        return false;
    }
}

async function loadUserProfile() {
    try {
        // Tentar carregar do localStorage primeiro
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
            userProfileData = { ...userProfileData, ...JSON.parse(savedProfile) };
        }

        // Atualizar com dados do usuário atual
        userProfileData.nome = currentUser.nome;
        userProfileData.email = currentUser.email;
        userProfileData.foto = localStorage.getItem('userPhoto');

        // Salvar perfil atualizado
        localStorage.setItem('userProfile', JSON.stringify(userProfileData));
        
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        // Usar dados básicos como fallback
        userProfileData.nome = currentUser.nome;
        userProfileData.email = currentUser.email || 'usuario@empresa.com';
    }
}

// ... (restante das funções mantidas, mas usando a nova estrutura)

// Funções de Geolocalização (atualizadas)
async function checkLocationPermission() {
    if (!('geolocation' in navigator)) {
        notificationManager.showError('Geolocalização não suportada neste dispositivo');
        return false;
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (error) => {
                console.warn('Permissão de localização negada:', error);
                notificationManager.showError(
                    'Permissão de localização é necessária para registrar ponto. ' +
                    'Por favor, habilite a localização nas configurações do seu navegador.'
                );
                resolve(false);
            },
            { 
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}

async function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp
            }),
            (error) => reject(error),
            { 
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 300000 // 5 minutos
            }
        );
    });
}

// Setup de Event Listeners
function setupEventListeners() {
    // Fechar modal ao clicar fora
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('profileModal');
        if (event.target === modal) {
            closeProfileModal();
        }
    });

    // Teclas de atalho
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeProfileModal();
        }
    });

    // Prevenir submit de formulários
    document.addEventListener('submit', (e) => {
        e.preventDefault();
    });
}

// Exportar para uso global (se necessário)
window.app = {
    utils,
    apiService,
    notificationManager,
    logout
};
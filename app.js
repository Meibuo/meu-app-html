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

    // Formatar data para input
    formatDateForInput: (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    },

    // Obter iniciais do nome
    getIniciais: (nome) => {
        if (!nome) return '??';
        return nome.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    },

    // Capitalizar primeira letra
    capitalize: (text) => {
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    },

    // Validar senha
    isValidPassword: (senha) => {
        return senha && senha.length >= 6;
    },

    // Gerar ID único
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
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

    // Métodos de ponto
    async registrarPonto(dados) {
        return this.request('/registrar-ponto', {
            method: 'POST',
            body: dados
        });
    },

    async registrarHoraExtra(dados) {
        return this.request('/registrar-ponto', {
            method: 'POST',
            body: dados
        });
    },

    async obterRegistros(usuario_id, limit = 50) {
        return this.request(`/registros/${usuario_id}?limit=${limit}`);
    },

    async obterEstatisticas(usuario_id) {
        return this.request(`/estatisticas/${usuario_id}`);
    },

    async excluirRegistro(registro_id) {
        return this.request(`/registros/${registro_id}`, {
            method: 'DELETE'
        });
    },

    // Métodos de exportação
    async exportarExcel(usuario_id, data_inicio = null, data_fim = null) {
        let url = `/exportar/excel/${usuario_id}`;
        if (data_inicio && data_fim) {
            url += `?data_inicio=${data_inicio}&data_fim=${data_fim}`;
        }
        return url; // Retorna a URL para download
    },

    async exportarPDF(usuario_id, data_inicio = null, data_fim = null) {
        let url = `/exportar/pdf/${usuario_id}`;
        if (data_inicio && data_fim) {
            url += `?data_inicio=${data_inicio}&data_fim=${data_fim}`;
        }
        return url; // Retorna a URL para download
    },

    // Métodos de administração
    async listarUsuarios() {
        return this.request('/admin/usuarios');
    },

    async cadastrarUsuario(dados) {
        return this.request('/admin/cadastro', {
            method: 'POST',
            body: dados
        });
    },

    async editarUsuario(usuario_id, dados) {
        return this.request(`/admin/usuarios/${usuario_id}`, {
            method: 'PUT',
            body: dados
        });
    },

    async excluirUsuario(usuario_id) {
        return this.request(`/admin/usuarios/${usuario_id}`, {
            method: 'DELETE'
        });
    },

    async redefinirSenha(usuario_id) {
        return this.request('/admin/redefinir-senha', {
            method: 'POST',
            body: { usuario_id_reset: usuario_id }
        });
    },

    async obterRegistrosAdmin(filtros = {}) {
        const params = new URLSearchParams();
        if (filtros.usuario_id_filter) params.append('usuario_id_filter', filtros.usuario_id_filter);
        if (filtros.data_inicio) params.append('data_inicio', filtros.data_inicio);
        if (filtros.data_fim) params.append('data_fim', filtros.data_fim);
        if (filtros.limit) params.append('limit', filtros.limit);

        return this.request(`/admin/registros?${params.toString()}`);
    },

    async editarRegistro(registro_id, dados) {
        return this.request(`/admin/registros/${registro_id}`, {
            method: 'PUT',
            body: dados
        });
    },

    async excluirRegistroAdmin(registro_id) {
        return this.request(`/admin/registros/${registro_id}`, {
            method: 'DELETE'
        });
    },

    async obterEstatisticasAdmin() {
        return this.request('/admin/estatisticas');
    },

    // Métodos de notificações
    async obterNotificacoes(usuario_id) {
        return this.request(`/notificacoes/${usuario_id}`);
    },

    async marcarNotificacaoComoLida(notificacao_id) {
        return this.request(`/notificacoes/${notificacao_id}/lida`, {
            method: 'PUT'
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
                transition: opacity 0.3s ease;
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
    },

    showInfo(message) {
        this.show(message, 'info');
    }
};

// Gerenciamento de Autenticação
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
    },

    isAuthenticated() {
        return currentUser !== null;
    }
};

// Gerenciamento de UI
const uiManager = {
    // Mostrar/ocultar loading
    showLoading(element = null) {
        if (element) {
            element.disabled = true;
            const originalText = element.innerHTML;
            element.setAttribute('data-original-text', originalText);
            element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
        }
    },

    hideLoading(element = null) {
        if (element) {
            element.disabled = false;
            const originalText = element.getAttribute('data-original-text');
            if (originalText) {
                element.innerHTML = originalText;
            }
        }
    },

    // Toggle elementos
    toggleElement(selector, show) {
        const element = document.querySelector(selector);
        if (element) {
            element.style.display = show ? 'block' : 'none';
        }
    },

    // Atualizar contadores
    updateCounter(selector, value) {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = value;
        }
    },

    // Formatar números
    formatNumber(number, decimals = 0) {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    },

    // Criar badge
    createBadge(text, type = 'primary') {
        const badge = document.createElement('span');
        badge.className = `badge bg-${type}`;
        badge.textContent = text;
        return badge;
    }
};

// Gerenciamento de Dados
const dataManager = {
    // Cache simples
    cache: new Map(),

    // Armazenar em cache
    setCache(key, data, ttl = 300000) { // 5 minutos padrão
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    },

    // Obter do cache
    getCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > cached.ttl) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    },

    // Limpar cache
    clearCache(key = null) {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    },

    // Processar dados de registros
    processRegistros(registros) {
        return registros.map(registro => ({
            ...registro,
            dataFormatada: utils.formatDate(registro.criadoEm),
            horaFormatada: new Date(registro.criadoEm).toLocaleTimeString('pt-BR'),
            isHoraExtra: registro.horas_extras
        }));
    },

    // Agrupar registros por data
    groupRegistrosByDate(registros) {
        const grouped = {};
        registros.forEach(registro => {
            const data = registro.dataFormatada;
            if (!grouped[data]) {
                grouped[data] = [];
            }
            grouped[data].push(registro);
        });
        return grouped;
    }
};

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await initializeApp();
    } catch (error) {
        console.error('Falha na inicialização:', error);
        notificationManager.showError('Erro ao inicializar a aplicação');
    }
});

async function initializeApp() {
    // Verificar se está na página de login
    if (window.location.pathname === '/login' || window.location.pathname === '/') {
        setupLoginPage();
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

    // Carregar dados específicos da página
    loadPageSpecificData();
}

function setupLoginPage() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Preencher campos lembrados
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        const emailInput = document.querySelector('input[type="email"]');
        if (emailInput) {
            emailInput.value = rememberedEmail;
        }
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    const form = event.target;
    const email = form.querySelector('input[type="email"]').value;
    const senha = form.querySelector('input[type="password"]').value;
    const remember = form.querySelector('input[type="checkbox"]')?.checked;

    const submitButton = form.querySelector('button[type="submit"]');
    uiManager.showLoading(submitButton);

    try {
        const result = await authManager.login(email, senha);
        
        if (result.success) {
            if (remember) {
                localStorage.setItem('rememberedEmail', email);
            } else {
                localStorage.removeItem('rememberedEmail');
            }

            // Redirecionar baseado no tipo de usuário
            setTimeout(() => {
                if (result.user.isAdmin) {
                    window.location.href = '/admin';
                } else {
                    window.location.href = '/dashboard';
                }
            }, 1000);
        }
    } finally {
        uiManager.hideLoading(submitButton);
    }
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
            if (confirm('Deseja realmente sair do sistema?')) {
                authManager.logout();
            }
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

    // Prevenir envio de formulários com Enter
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.form) {
            const submitButton = e.target.form.querySelector('button[type="submit"]');
            if (submitButton) {
                e.preventDefault();
                submitButton.click();
            }
        }
    });
}

function loadPageSpecificData() {
    const path = window.location.pathname;
    
    switch (path) {
        case '/dashboard':
            loadDashboardData();
            break;
        case '/admin':
            loadAdminData();
            break;
        case '/perfil':
            loadProfileData();
            break;
        default:
            // Página não específica
            break;
    }
}

async function loadDashboardData() {
    if (!currentUser) return;

    try {
        // Carregar registros
        const registrosResponse = await apiService.obterRegistros(currentUser.id);
        if (registrosResponse.success) {
            const registrosProcessados = dataManager.processRegistros(registrosResponse.registros);
            updateRegistrosList(registrosProcessados);
        }

        // Carregar estatísticas
        const statsResponse = await apiService.obterEstatisticas(currentUser.id);
        if (statsResponse.success) {
            updateStatistics(statsResponse.estatisticas);
        }

        // Carregar notificações
        const notificacoesResponse = await apiService.obterNotificacoes(currentUser.id);
        if (notificacoesResponse.success) {
            updateNotifications(notificacoesResponse.notificacoes);
        }

    } catch (error) {
        console.error('Erro ao carregar dados do dashboard:', error);
        notificationManager.showError('Erro ao carregar dados');
    }
}

async function loadAdminData() {
    if (!currentUser || !currentUser.isAdmin) return;

    try {
        // Carregar estatísticas do sistema
        const statsResponse = await apiService.obterEstatisticasAdmin();
        if (statsResponse.success) {
            updateAdminStatistics(statsResponse.estatisticas);
        }

        // Carregar usuários
        const usuariosResponse = await apiService.listarUsuarios();
        if (usuariosResponse.success) {
            updateUsersList(usuariosResponse.usuarios);
        }

        // Carregar registros
        const registrosResponse = await apiService.obterRegistrosAdmin({ limit: 50 });
        if (registrosResponse.success) {
            updateAdminRegistrosList(registrosResponse.registros);
        }

    } catch (error) {
        console.error('Erro ao carregar dados administrativos:', error);
        notificationManager.showError('Erro ao carregar dados administrativos');
    }
}

function loadProfileData() {
    // Preencher formulário de perfil
    const profileForm = document.getElementById('profileForm');
    if (profileForm && currentUser) {
        profileForm.querySelector('#nome').value = currentUser.nome || '';
        profileForm.querySelector('#email').value = currentUser.email || '';
        profileForm.querySelector('#telefone').value = currentUser.telefone || '';
        profileForm.querySelector('#cargo').value = currentUser.cargo || '';
    }
}

// Funções específicas do Dashboard
function updateRegistrosList(registros) {
    const container = document.getElementById('lista-registros');
    const emptyState = document.getElementById('sem-registros');
    
    if (!container) return;

    if (!registros || registros.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        container.style.display = 'none';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    container.style.display = 'block';

    // Ordenar por data (mais recente primeiro)
    registros.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

    container.innerHTML = registros.map(registro => `
        <div class="registro-item ${registro.isHoraExtra ? 'hora-extra' : ''}">
            <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center mb-2">
                        <strong class="me-2">${registro.isHoraExtra ? 'Hora Extra registrada' : 'Ponto registrado'}</strong>
                        <span class="badge ${registro.isHoraExtra ? 'bg-danger' : 'bg-success'}">
                            ${registro.isHoraExtra ? 'Hora Extra' : registro.tipo}
                        </span>
                    </div>
                    <div class="text-muted small">
                        <i class="fas fa-calendar me-1"></i>${registro.dataFormatada}
                        ${registro.local ? `<br><i class="fas fa-map-marker-alt me-1"></i>${registro.local}` : ''}
                        ${registro.observacao ? `<br><i class="fas fa-sticky-note me-1"></i>${registro.observacao}` : ''}
                    </div>
                    ${registro.isHoraExtra ? 
                        `<div class="hora-extra-info">
                            <small><strong>Horário:</strong> ${registro.hora_entrada} às ${registro.hora_saida}</small>
                        </div>` :
                        `<div class="horarios-dia">
                            <small><strong>Horários:</strong> ${registro.horariosDia?.texto || 'Não definido'}</small>
                        </div>`
                    }
                </div>
                <div class="ms-3">
                    <button class="btn btn-sm btn-outline-danger" onclick="excluirRegistro('${registro.id}')" title="Excluir registro">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function updateStatistics(estatisticas) {
    if (estatisticas.horasExtras !== undefined) {
        uiManager.updateCounter('#horas-extras', estatisticas.horasExtras);
    }
}

function updateNotifications(notificacoes) {
    // Implementar atualização de notificações na UI
    const notificacoesContainer = document.getElementById('notificacoes-list');
    if (!notificacoesContainer) return;

    if (!notificacoes || notificacoes.length === 0) {
        notificacoesContainer.innerHTML = '<div class="text-center text-muted py-3">Nenhuma notificação</div>';
        return;
    }

    notificacoesContainer.innerHTML = notificacoes.map(notif => `
        <div class="notification-item ${notif.lida ? '' : 'unread'}">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="mb-1">${notif.titulo}</h6>
                    <p class="mb-1">${notif.mensagem}</p>
                    <small class="text-muted">${utils.formatDate(notif.criadoEm)}</small>
                </div>
                ${!notif.lida ? 
                    '<span class="badge bg-primary">Nova</span>' : 
                    ''
                }
            </div>
        </div>
    `).join('');
}

// Funções específicas do Admin
function updateAdminStatistics(estatisticas) {
    uiManager.updateCounter('#total-users', estatisticas.totalUsers);
    uiManager.updateCounter('#total-registros', estatisticas.totalRegistros);
    uiManager.updateCounter('#registros-hoje', estatisticas.registrosHoje);
    uiManager.updateCounter('#admin-users', estatisticas.totalAdmins);
}

function updateUsersList(usuarios) {
    const tbody = document.getElementById('usuarios-body');
    if (!tbody) return;

    if (!usuarios || usuarios.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    <i class="fas fa-users fa-2x mb-2"></i><br>
                    Nenhum usuário encontrado
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = usuarios.map(usuario => `
        <tr>
            <td>
                <strong>${usuario.nome}</strong>
                ${usuario.isAdmin ? '<span class="badge bg-warning ms-1">Admin</span>' : ''}
            </td>
            <td>${usuario.email}</td>
            <td>${usuario.telefone || '-'}</td>
            <td>${usuario.cargo}</td>
            <td>
                <span class="badge ${usuario.status === 'ativo' ? 'bg-success' : 'bg-secondary'}">
                    ${usuario.status}
                </span>
            </td>
            <td>${utils.formatDate(usuario.criadoEm)}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editarUsuario('${usuario.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-warning" onclick="redefinirSenha('${usuario.id}')">
                    <i class="fas fa-key"></i>
                </button>
                ${!usuario.isAdmin ? `
                    <button class="btn btn-sm btn-outline-danger" onclick="excluirUsuario('${usuario.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

function updateAdminRegistrosList(registros) {
    const tbody = document.getElementById('registros-admin-body');
    if (!tbody) return;

    if (!registros || registros.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i><br>
                    Nenhum registro encontrado
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = registros.map(registro => `
        <tr>
            <td>
                <strong>${registro.usuario_nome}</strong>
                <br><small class="text-muted">${registro.usuario_cargo}</small>
            </td>
            <td>${registro.data}</td>
            <td>${registro.hora_entrada || '-'}</td>
            <td>${registro.hora_saida || '-'}</td>
            <td>${registro.local || '-'}</td>
            <td>${registro.observacao || '-'}</td>
            <td>${registro.horas_extras ? '<span class="badge bg-warning">Sim</span>' : 'Não'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editarRegistroAdmin('${registro.id}')">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Funções globais para uso em outras páginas
window.app = {
    utils,
    apiService,
    authManager,
    notificationManager,
    uiManager,
    dataManager,
    getCurrentUser: () => currentUser
};

// Funções globais
window.logout = authManager.logout;

window.checkAuth = () => {
    if (!authManager.isAuthenticated() && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
    }
};

// Funções de registro de ponto
window.registrarPonto = async function() {
    if (!currentUser) return;

    const local = document.getElementById('local')?.value;
    const observacao = document.getElementById('observacao')?.value;

    if (!local) {
        notificationManager.showWarning('Por favor, informe o local');
        return;
    }

    const button = document.querySelector('.btn-registrar');
    uiManager.showLoading(button);

    try {
        const result = await apiService.registrarPonto({
            usuario_id: currentUser.id,
            local: local,
            observacao: observacao,
            horas_extras: false
        });

        if (result.success) {
            notificationManager.showSuccess(result.message);
            // Limpar campos
            if (document.getElementById('local')) document.getElementById('local').value = '';
            if (document.getElementById('observacao')) document.getElementById('observacao').value = '';
            
            // Recarregar dados
            await loadDashboardData();
        } else {
            notificationManager.showError(result.error);
        }
    } catch (error) {
        notificationManager.showError('Erro ao registrar ponto');
    } finally {
        uiManager.hideLoading(button);
    }
};

window.registrarHoraExtra = async function() {
    if (!currentUser) return;

    const dataHoraExtra = document.getElementById('data-hora-extra')?.value;
    const horaEntrada = document.getElementById('hora-entrada')?.value;
    const horaSaida = document.getElementById('hora-saida')?.value;
    const localHoraExtra = document.getElementById('local-hora-extra')?.value;
    const observacaoHoraExtra = document.getElementById('observacao-hora-extra')?.value;

    if (!dataHoraExtra || !horaEntrada || !horaSaida || !localHoraExtra) {
        notificationManager.showWarning('Por favor, preencha todos os campos obrigatórios');
        return;
    }

    if (horaEntrada >= horaSaida) {
        notificationManager.showWarning('A hora de entrada deve ser anterior à hora de saída');
        return;
    }

    try {
        const result = await apiService.registrarHoraExtra({
            usuario_id: currentUser.id,
            local: localHoraExtra,
            observacao: observacaoHoraExtra,
            horas_extras: true,
            data_custom: dataHoraExtra,
            hora_entrada: horaEntrada,
            hora_saida: horaSaida
        });

        if (result.success) {
            notificationManager.showSuccess(result.message);
            // Fechar modal e limpar formulário
            const modal = bootstrap.Modal.getInstance(document.getElementById('modalHoraExtra'));
            if (modal) modal.hide();
            
            // Recarregar dados
            await loadDashboardData();
        } else {
            notificationManager.showError(result.error);
        }
    } catch (error) {
        notificationManager.showError('Erro ao registrar hora extra');
    }
};

window.excluirRegistro = async function(registroId) {
    if (!confirm('Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        const result = await apiService.excluirRegistro(registroId);
        if (result.success) {
            notificationManager.showSuccess(result.message);
            await loadDashboardData();
        } else {
            notificationManager.showError(result.error);
        }
    } catch (error) {
        notificationManager.showError('Erro ao excluir registro');
    }
};

// Funções de exportação
window.exportarExcel = async function() {
    if (!currentUser) return;

    const dataInicio = document.getElementById('data-inicio')?.value;
    const dataFim = document.getElementById('data-fim')?.value;

    try {
        const url = await apiService.exportarExcel(currentUser.id, dataInicio, dataFim);
        window.open(url, '_blank');
        notificationManager.showSuccess('Exportação para Excel iniciada!');
    } catch (error) {
        notificationManager.showError('Erro ao exportar para Excel');
    }
};

window.exportarPDF = async function() {
    if (!currentUser) return;

    const dataInicio = document.getElementById('data-inicio')?.value;
    const dataFim = document.getElementById('data-fim')?.value;

    try {
        const url = await apiService.exportarPDF(currentUser.id, dataInicio, dataFim);
        window.open(url, '_blank');
        notificationManager.showSuccess('Exportação para PDF iniciada!');
    } catch (error) {
        notificationManager.showError('Erro ao exportar para PDF');
    }
};

// Funções administrativas
window.carregarUsuarios = async function() {
    try {
        const result = await apiService.listarUsuarios();
        if (result.success) {
            updateUsersList(result.usuarios);
        } else {
            notificationManager.showError(result.error);
        }
    } catch (error) {
        notificationManager.showError('Erro ao carregar usuários');
    }
};

window.carregarRegistrosAdmin = async function() {
    try {
        const userId = document.getElementById('filter-user')?.value;
        const startDate = document.getElementById('filter-start')?.value;
        const endDate = document.getElementById('filter-end')?.value;

        const result = await apiService.obterRegistrosAdmin({
            usuario_id_filter: userId,
            data_inicio: startDate,
            data_fim: endDate,
            limit: 200
        });

        if (result.success) {
            updateAdminRegistrosList(result.registros);
        } else {
            notificationManager.showError(result.error);
        }
    } catch (error) {
        notificationManager.showError('Erro ao carregar registros');
    }
};

// Inicializar tooltips do Bootstrap se disponível
if (typeof bootstrap !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        const tooltipList = tooltipTriggerList.map(function(tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    });
}

console.log('Sistema de Ponto - App.js carregado com sucesso!');
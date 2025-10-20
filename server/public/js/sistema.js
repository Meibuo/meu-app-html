// Sistema de Registro de Ponto (com autenticação)
class SistemaPonto {
    constructor() {
        this.authSystem = new AuthSystem();
        this.usuarioLogado = this.authSystem.getUsuarioLogado();
        
        if (!this.usuarioLogado) {
            window.location.href = 'index.html';
            return;
        }

        this.registros = JSON.parse(localStorage.getItem('registrosPonto')) || [];
        this.init();
    }

    init() {
        this.atualizarRelogio();
        this.carregarDadosUsuario();
        this.carregarDados();
        this.configurarEventos();
        this.atualizarStatusDia();
    }

    carregarDadosUsuario() {
        document.getElementById('nome-funcionario').textContent = this.usuarioLogado.nomeCompleto;
        document.getElementById('empresa-funcionario').textContent = this.usuarioLogado.empresa;
        
        // Preencher perfil
        document.getElementById('perfil-nome').textContent = this.usuarioLogado.nomeCompleto;
        document.getElementById('perfil-email').textContent = this.usuarioLogado.email;
        document.getElementById('perfil-empresa').textContent = this.usuarioLogado.empresa;
        document.getElementById('perfil-cargo').textContent = this.usuarioLogado.cargo;
        document.getElementById('perfil-data-cadastro').textContent = this.usuarioLogado.dataCadastro;
    }

    atualizarRelogio() {
        const atualizar = () => {
            const agora = new Date();
            document.getElementById('data-atual').textContent = 
                agora.toLocaleDateString('pt-BR');
            document.getElementById('hora-atual').textContent = 
                agora.toLocaleTimeString('pt-BR');
        };
        
        atualizar();
        setInterval(atualizar, 1000);
    }

    carregarDados() {
        this.atualizarHistorico();
    }

    configurarEventos() {
        // Botões de registro
        document.getElementById('btn-entrada').addEventListener('click', () => {
            this.registrarPonto('entrada');
        });

        document.getElementById('btn-saida-almoco').addEventListener('click', () => {
            this.registrarPonto('saida_almoco');
        });

        document.getElementById('btn-retorno-almoco').addEventListener('click', () => {
            this.registrarPonto('retorno_almoco');
        });

        document.getElementById('btn-saida').addEventListener('click', () => {
            this.registrarPonto('saida');
        });

        // Filtro do histórico
        document.getElementById('filtro-mes').addEventListener('change', (e) => {
            this.filtrarHistorico(e.target.value);
        });

        // Botão exportar
        document.getElementById('btn-exportar').addEventListener('click', () => {
            this.exportarDados();
        });

        // Botão logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.authSystem.fazerLogout();
        });
    }

    registrarPonto(tipo) {
        const agora = new Date();
        const registro = {
            id: Date.now(),
            usuarioId: this.usuarioLogado.id,
            funcionario: this.usuarioLogado.nomeCompleto,
            funcionarioId: this.usuarioLogado.id,
            tipo: tipo,
            data: agora.toLocaleDateString('pt-BR'),
            hora: agora.toLocaleTimeString('pt-BR'),
            timestamp: agora.getTime(),
            empresa: this.usuarioLogado.empresa
        };

        this.registros.unshift(registro);
        this.salvarDados();
        this.mostrarConfirmacao(registro);
        this.atualizarStatusDia();
        this.atualizarHistorico();
    }

    mostrarConfirmacao(registro) {
        const tipos = {
            entrada: '🏢 Entrada registrada',
            saida_almoco: '🍽 Saída para almoço',
            retorno_almoco: '↩ Retorno do almoço',
            saida: '🏠 Saída registrada'
        };

        document.getElementById('ultimo-registro-texto').textContent = 
            `${tipos[registro.tipo]} às ${registro.hora}`;
        
        // Efeito visual
        const ultimoRegistro = document.querySelector('.ultimo-registro');
        ultimoRegistro.style.background = '#27ae60';
        setTimeout(() => {
            ultimoRegistro.style.background = '#34495e';
        }, 2000);
    }

    atualizarStatusDia() {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const registrosHoje = this.registros.filter(r => 
            r.data === hoje && r.usuarioId === this.usuarioLogado.id
        );

        const status = {
            entrada: '--:--',
            saida_almoco: '--:--',
            retorno_almoco: '--:--',
            saida: '--:--'
        };

        registrosHoje.forEach(registro => {
            status[registro.tipo] = registro.hora.slice(0, 5); // Apenas horas:minutos
        });

        document.getElementById('status-entrada').textContent = status.entrada;
        document.getElementById('status-almoco-saida').textContent = status.saida_almoco;
        document.getElementById('status-almoco-retorno').textContent = status.retorno_almoco;
        document.getElementById('status-saida').textContent = status.saida;
    }

    atualizarHistorico(mesFiltro = null) {
        const lista = document.getElementById('lista-registros');
        
        // Filtrar apenas registros do usuário logado
        let registrosExibir = this.registros.filter(r => 
            r.usuarioId === this.usuarioLogado.id
        );

        if (mesFiltro) {
            const [ano, mes] = mesFiltro.split('-');
            registrosExibir = registrosExibir.filter(registro => {
                const [diaReg, mesReg, anoReg] = registro.data.split('/');
                return mesReg === mes && anoReg === ano;
            });
        }

        if (registrosExibir.length === 0) {
            lista.innerHTML = '<p class="sem-registros">Nenhum registro encontrado</p>';
            return;
        }

        lista.innerHTML = registrosExibir.map(registro => {
            const tipos = {
                entrada: '🏢 Entrada',
                saida_almoco: '🍽 Saída Almoço',
                retorno_almoco: '↩ Retorno Almoço',
                saida: '🏠 Saída'
            };

            return `
                <div class="registro-item">
                    <div class="registro-data">${registro.data}</div>
                    <div class="registro-hora">${registro.hora}</div>
                    <div class="registro-tipo">${tipos[registro.tipo]}</div>
                </div>
            `;
        }).join('');
    }

    filtrarHistorico(mes) {
        this.atualizarHistorico(mes || null);
    }

    exportarDados() {
        const registrosUsuario = this.registros.filter(r => 
            r.usuarioId === this.usuarioLogado.id
        );
        
        const dados = registrosUsuario.map(reg => 
            `${reg.data},${reg.hora},${reg.tipo},${reg.funcionario}`
        ).join('\n');
        
        const cabecalho = 'Data,Hora,Tipo,Funcionário\n';
        const blob = new Blob([cabecalho + dados], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ponto-${this.usuarioLogado.nomeCompleto}-${new Date().toLocaleDateString('pt-BR')}.csv`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    salvarDados() {
        localStorage.setItem('registrosPonto', JSON.stringify(this.registros));
    }
}

// Smooth scroll para navegação
document.addEventListener('DOMContentLoaded', function() {
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
});

// Inicializar o sistema quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    new SistemaPonto();
});
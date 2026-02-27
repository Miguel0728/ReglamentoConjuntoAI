// LegalBot - Claude Style JavaScript
// Conectado con el backend de IA

// DOM Elements - Se inicializarán cuando el DOM esté listo
let sidebar = null;
let input = null;
let inputChat = null;
let inputArea = null;
let welcome = null;
let chat = null;
let settingsMenu = null;

// Variables globales
let currentReglamento = 'todos';
let conversationHistory = [];
let currentSessionId = null;

// Sincroniza ambos selectores y actualiza la variable global
function setFiltroReglamento(value) {
    currentReglamento = value;
    const s1 = document.getElementById('filtroSelect');
    const s2 = document.getElementById('filtroSelectChat');
    if (s1 && s1.value !== value) s1.value = value;
    if (s2 && s2.value !== value) s2.value = value;
}

// ============================================
// CARGAR TEMA INMEDIATAMENTE
// ============================================
(function () {
    const serverThemeMeta = document.querySelector('meta[name="server-theme"]');
    const serverTheme = serverThemeMeta ? serverThemeMeta.content : null;

    if (serverTheme && serverTheme !== 'system' && serverTheme !== 'None' && serverTheme.trim() !== '') {
        document.documentElement.setAttribute('data-theme', serverTheme);
        console.log('🎨 Tema aplicado desde servidor:', serverTheme);
    } else {
        // Intentar localStorage
        const meta = document.querySelector('meta[name="current-user"]');
        const userId = meta && meta.content ? meta.content.trim() : 'public';
        const storageKey = `legalbot-theme-${userId}`;
        const savedTheme = localStorage.getItem(storageKey);

        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            console.log('🎨 Tema aplicado desde localStorage:', savedTheme);
        } else {
            // Tema predeterminado: Ocean
            document.documentElement.setAttribute('data-theme', 'ocean');
            console.log('🎨 Tema predeterminado aplicado: ocean');
        }
    }
})();

// Toggle Sidebar
function toggleSidebar() {
    if (sidebar) sidebar.classList.toggle('collapsed');
}

// Toggle Settings
function toggleSettings() {
    settingsMenu.classList.toggle('active');
}

// Spin Logo - Animación divertida al hacer clic
let spinCount = 0;
function spinLogo(element) {
    spinCount++;

    // Remover la clase para reiniciar la animación
    element.classList.remove('spinning');

    // Forzar reflow para reiniciar la animación
    void element.offsetWidth;

    // Agregar la clase para iniciar la animación
    element.classList.add('spinning');

    // Efectos especiales cada 5 clics
    if (spinCount % 5 === 0) {
        element.style.filter = `hue-rotate(${spinCount * 30}deg)`;
        setTimeout(() => {
            element.style.filter = '';
        }, 1000);
    }

    // Remover la clase después de la animación
    setTimeout(() => {
        element.classList.remove('spinning');
    }, 600);
}

// Close settings when clicking outside
document.addEventListener('click', function (e) {
    if (!e.target.closest('.user-profile') && !e.target.closest('.settings-menu')) {
        if (settingsMenu) settingsMenu.classList.remove('active');
    }
    // Cerrar menú de temas al hacer clic fuera
    if (!e.target.closest('.theme-menu') && !e.target.closest('.sidebar-toggle')) {
        const themeMenu = document.getElementById('themeMenu');
        if (themeMenu) themeMenu.classList.remove('active');
    }
});

// ============================================
// SISTEMA DE TEMAS (Light/Dark Mode)
// ============================================

// Toggle del menú de temas
function toggleThemeMenu() {
    const themeMenu = document.getElementById('themeMenu');
    if (themeMenu) {
        themeMenu.classList.toggle('active');
    }
}

// Establecer tema
// Helper para obtener nombre de usuario actual
// Helper para obtener nombre de usuario actual
function getCurrentUserPrefix() {
    const meta = document.querySelector('meta[name="current-user"]');
    if (meta && meta.content && meta.content.trim() !== '') {
        const userId = meta.content.trim();
        return `legalbot-theme-${userId}`;
    }
    console.log('⚠️ No se detectó usuario logueado en meta tag, usando modo público');
    return 'legalbot-theme-public';
}

// Establecer tema
// Establecer tema
function setTheme(theme) {
    console.log(`🎨 setTheme llamado con: ${theme}`);
    document.documentElement.setAttribute('data-theme', theme);

    // 1. Guardar en LocalStorage (backup local)
    const storageKey = getCurrentUserPrefix();
    localStorage.setItem(storageKey, theme);
    console.log(`💾 Guardado en localStorage: ${storageKey} = ${theme}`);

    // 2. Guardar en Backend (persistencia real)
    console.log(`📡 Enviando tema al servidor...`);
    fetch('/api/config/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme })
    })
        .then(response => {
            console.log(`📥 Respuesta del servidor:`, response.status);
            return response.json();
        })
        .then(data => {
            console.log(`✅ Respuesta JSON:`, data);
            if (data.success) {
                // Mostrar feedback visual breve
                const feedback = document.createElement('div');
                feedback.textContent = '✓ Tema guardado';
                feedback.style.cssText = 'position:fixed;top:20px;right:20px;background:#10a37f;color:white;padding:12px 20px;border-radius:8px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
                document.body.appendChild(feedback);
                setTimeout(() => feedback.remove(), 2000);
            } else {
                console.error(`❌ Error del servidor: ${data.message}`);
            }
        })
        .catch(err => {
            console.error('❌ Error guardando tema en BD:', err);
        });

    // Cerrar menú
    const themeMenu = document.getElementById('themeMenu');
    if (themeMenu) themeMenu.classList.remove('active');

    // Controlar efecto de nieve
    if (theme === 'christmas') {
        startSnowfall();
    } else {
        stopSnowfall();
    }
}

// Función para seleccionar tema desde el dropdown del menú
function selectTheme(theme) {
    // Aplicar el tema
    setTheme(theme);

    // Actualizar indicador visual (checkmark)
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    document.querySelector(`.theme-option[data-theme="${theme}"]`)?.classList.add('active');

    // Cerrar el menú de configuración
    const settingsMenu = document.getElementById('settingsMenu');
    if (settingsMenu) settingsMenu.classList.remove('active');
}

// Toggle del submenu de temas
function toggleThemeSubmenu(event) {
    event.stopPropagation(); // Evitar que se cierre el menú principal
    console.log('🔄 toggleThemeSubmenu llamado');
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        themeSelector.classList.toggle('open');
        console.log('✅ Clase "open" toggled. Ahora:', themeSelector.classList.contains('open') ? 'ABIERTO' : 'CERRADO');
    } else {
        console.error('❌ No se encontró #themeSelector');
    }
}

// Cargar tema guardado al iniciar
function loadSavedTheme() {
    console.log('🚀 loadSavedTheme() INICIANDO...');

    // 1. PRIORIDAD: Tema del servidor (Base de datos)
    const serverThemeMeta = document.querySelector('meta[name="server-theme"]');
    const serverTheme = serverThemeMeta ? serverThemeMeta.content : null;

    // 2. Fallback a LocalStorage
    const storageKey = getCurrentUserPrefix();
    const savedTheme = localStorage.getItem(storageKey);

    // Determinar tema: Servidor (BD) > localStorage > Sistema
    let themeToApply = null;

    if (serverTheme && serverTheme !== 'system' && serverTheme !== 'None' && serverTheme.trim() !== '') {
        // Tema válido del servidor (BD) - PRIORIDAD MÁXIMA
        themeToApply = serverTheme;
        console.log(`📂 Cargando tema de BD: ${themeToApply}`);

        // Sincronizar localStorage con BD
        localStorage.setItem(storageKey, themeToApply);
    } else if (savedTheme) {
        // Fallback a localStorage
        themeToApply = savedTheme;
        console.log(`📂 Cargando tema de localStorage: ${themeToApply}`);
    } else {
        // Sin tema guardado - Usar Ocean como predeterminado
        themeToApply = 'ocean';
        console.log(`📂 Sin tema guardado, usando Ocean como predeterminado`);
    }

    if (themeToApply) {
        document.documentElement.setAttribute('data-theme', themeToApply);

        if (themeToApply === 'christmas') {
            setTimeout(startSnowfall, 100);
        } else {
            stopSnowfall();
        }
    }
}

// Función para obtener el input activo
function getActiveInput() {
    return welcome.classList.contains('hidden') ? inputChat : input;
}

// Auto-resize textarea para ambos inputs
function setupTextareaResize(textarea) {
    if (!textarea) return;
    textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
    textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}


// ============================================
// SISTEMA DE HISTORIAL DE CONVERSACIONES
// ============================================


// Cargar historial de conversaciones al iniciar
async function loadConversationHistory() {
    const conversationsList = document.getElementById('conversationsList');
    const loadingEl = document.getElementById('conversationsLoading');
    const emptyEl = document.getElementById('conversationsEmpty');

    console.log('🔄 loadConversationHistory() iniciando...');

    try {
        const response = await fetch('/api/sesiones');
        console.log('📡 Response status:', response.status);

        if (response.status === 401) {
            // No autenticado - solo ocultar loading y mostrar vacío
            // NO redirigir para evitar loops infinitos
            console.warn('⚠️ No autenticado - no se puede cargar historial');
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) {
                emptyEl.innerHTML = '<span class="empty-text">Inicia sesión para ver tu historial</span>';
                emptyEl.style.display = 'flex';
            }
            return;
        }

        const data = await response.json();
        console.log('📦 Data recibida:', data);
        console.log('📊 Número de sesiones:', data.sesiones ? data.sesiones.length : 0);

        // Ocultar loading
        if (loadingEl) loadingEl.style.display = 'none';

        if (!data.success || !data.sesiones || data.sesiones.length === 0) {
            // Mostrar mensaje de vacío
            console.log('❌ No hay sesiones para mostrar');
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }

        // Ocultar mensaje vacío
        if (emptyEl) emptyEl.style.display = 'none';

        // Renderizar conversaciones
        console.log('✅ Renderizando', data.sesiones.length, 'conversaciones');
        renderConversations(data.sesiones);

    } catch (error) {
        console.error('❌ Error cargando historial:', error);
        if (loadingEl) loadingEl.innerHTML = '<span>Error cargando historial</span>';
    }
}

// Renderizar lista de conversaciones
function renderConversations(sesiones) {
    const conversationsList = document.getElementById('conversationsList');
    const loadingEl = document.getElementById('conversationsLoading');
    const emptyEl = document.getElementById('conversationsEmpty');

    console.log('🎨 renderConversations() - Renderizando', sesiones.length, 'conversaciones');

    // Ocultar elementos de estado
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';

    // Eliminar solo los conversation-item existentes, no los elementos de estado
    const existingItems = conversationsList.querySelectorAll('.conversation-item');
    existingItems.forEach(item => item.remove());

    // Agregar las nuevas conversaciones
    sesiones.forEach((sesion, index) => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (index === 0 ? ' active' : '');
        item.dataset.sessionId = sesion.session_id;

        item.innerHTML = `
            <span class="conversation-title" onclick="loadConversation('${sesion.session_id}')">${sesion.titulo}</span>
            <button class="conversation-delete" onclick="deleteConversation(event, '${sesion.session_id}')" title="Eliminar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/>
                </svg>
            </button>
        `;

        conversationsList.appendChild(item);
    });

    console.log('✅ renderConversations() - Completado');
}

// Cargar una conversación específica
async function loadConversation(sessionId) {
    try {
        // Actualizar estado activo en sidebar
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.sessionId === sessionId) {
                item.classList.add('active');
            }
        });

        currentSessionId = sessionId;

        const response = await fetch(`/api/historial/${sessionId}?limite=50`);
        const data = await response.json();

        if (data.success && data.mensajes && data.mensajes.length > 0) {
            // Mostrar chat, ocultar welcome, mostrar input-area
            welcome.classList.add('hidden');
            chat.classList.add('active');
            if (inputArea) inputArea.classList.add('visible');

            // Limpiar chat actual
            chat.innerHTML = '';

            // Renderizar mensajes SIN animación (skipAnimation = true)
            data.mensajes.forEach(msg => {
                const referencias = msg.referencias || [];
                // Pasar el ID del mensaje
                addMessage(msg.role === 'user' ? 'user' : 'assistant', msg.message, true, referencias, msg.id);
            });

            // Focus en el input del chat
            if (inputChat) inputChat.focus();
        }
    } catch (error) {
        console.error('Error cargando conversación:', error);
    }
}

// Eliminar una conversación
async function deleteConversation(event, sessionId) {
    event.stopPropagation();

    // Mostrar modal personalizado en vez de confirm()
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        // Mostrar el modal
        modal.classList.add('active');

        // Handler para confirmar eliminación
        const handleConfirm = async () => {
            // Ocultar modal
            modal.classList.remove('active');

            try {
                const response = await fetch(`/api/historial/${sessionId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (data.success) {
                    // Remover de la UI
                    const item = event.target.closest('.conversation-item');
                    if (item) {
                        item.remove();
                    }

                    // Si era la conversación actual, limpiar el chat
                    if (currentSessionId === sessionId) {
                        newChat();
                    }

                    // Verificar si quedan conversaciones
                    const remaining = document.querySelectorAll('.conversation-item').length;
                    if (remaining === 0) {
                        const emptyEl = document.getElementById('conversationsEmpty');
                        if (emptyEl) emptyEl.style.display = 'flex';
                    }
                }
            } catch (error) {
                console.error('Error eliminando conversación:', error);
                alert('Error al eliminar la conversación');
            }

            // Limpiar event listeners
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            resolve(true);
        };

        // Handler para cancelar
        const handleCancel = () => {
            modal.classList.remove('active');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            resolve(false);
        };

        // Asignar event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);

        // Cerrar modal al hacer clic fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        });
    });
}

// Ask question (from suggestion pills)
function ask(question) {
    const activeInput = getActiveInput();
    activeInput.value = question;
    sendMessage();
}

// ============================================
// PROCESAMIENTO DE PENSAMIENTO VISIBLE
// ============================================

// Función para procesar la respuesta con pensamiento separado
function processResponseWithThought(responseText) {
    // 1. Buscamos el contenido entre las etiquetas <analisis>
    const thoughtPattern = /<analisis>([\s\S]*?)<\/analisis>/;
    const match = responseText.match(thoughtPattern);

    let thoughtContent = null;
    let finalAnswer = responseText;

    if (match) {
        thoughtContent = match[1].trim(); // El texto del pensamiento
        finalAnswer = responseText.replace(thoughtPattern, "").trim(); // La respuesta limpia
    }

    return { thought: thoughtContent, answer: finalAnswer };
}

// Formatea el HTML de respuesta evitando <br> duplicados dentro de elementos de bloque
function formatResponseHTML(text) {
    // Convertir **negrita** markdown a <strong>
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Si el contenido tiene elementos de bloque HTML, no convertir \n a <br> masivamente
    const hasBlockElements = /<(ol|ul|li|p|h[1-6]|blockquote)[^>]*>/i.test(formatted);

    if (hasBlockElements) {
        // Eliminar saltos de línea justo antes/después de etiquetas de bloque
        formatted = formatted.replace(/\n+(<\/?(ol|ul|li|p|h[1-6]|blockquote)[^>]*>)/gi, '$1');
        formatted = formatted.replace(/(<\/?(ol|ul|li|p|h[1-6]|blockquote)[^>]*>)\n+/gi, '$1');
        // Convertir saltos dobles restantes a <br>, los simples a espacio
        formatted = formatted.replace(/\n{2,}/g, '<br>');
        formatted = formatted.replace(/\n/g, ' ');
    } else {
        formatted = formatted.replace(/\n/g, '<br>');
    }

    return formatted;
}

// ============================================
// AUTO-SCROLL INTELIGENTE
// ============================================

// Verifica si el usuario está cerca del final del chat (scroll bottom)
function isUserAtBottom() {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return true;

    const threshold = 100; // Pixeles de tolerancia
    const position = messagesContainer.scrollTop + messagesContainer.clientHeight;
    const height = messagesContainer.scrollHeight;

    return position >= height - threshold;
}

// Hace scroll solo si el usuario está en la parte inferior
function smartScrollToBottom() {
    if (isUserAtBottom()) {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}

// Send message - Conectado con el backend de IA
async function sendMessage() {
    const activeInput = getActiveInput();
    const text = activeInput.value.trim();
    if (!text) return;

    // Hide welcome, show chat and input-area
    welcome.classList.add('hidden');
    chat.classList.add('active');
    if (inputArea) inputArea.classList.add('visible');

    // Add user message
    addMessage('user', text);

    // Clear both inputs
    input.value = '';
    input.style.height = 'auto';
    if (inputChat) {
        inputChat.value = '';
        inputChat.style.height = 'auto';
        inputChat.focus();
    }

    // Show typing indicator
    showTypingIndicator();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                reglamento: currentReglamento,
                session_id: currentSessionId,
                new_conversation: currentSessionId === null
            })
        });

        if (response.status === 401) {
            hideTypingIndicator();
            alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            hideTypingIndicator();
            const errorData = await response.json();
            addMessage('assistant', '❌ Error: ' + (errorData.error || 'Error desconocido'));
            return;
        }

        // --- STREAMING LOGIC ---
        hideTypingIndicator();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        // Crear el mensaje del bot vacío para ir llenando
        const botMsgEl = createStreamingBotMessage();
        const contentDiv = botMsgEl.querySelector('.message-content');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();

                    try {
                        const data = JSON.parse(dataStr);

                        if (data.error) {
                            finalizeStreamingMessage(botMsgEl, '❌ Error: ' + data.error, []);
                            return;
                        }

                        if (data.content) {
                            fullText += data.content;
                            contentDiv.textContent = fullText;
                            smartScrollToBottom();
                        }

                        if (data.done) {
                            // Actualizar session_id y recargar historial
                            if (data.session_id) {
                                const wasNew = !currentSessionId || currentSessionId !== data.session_id;
                                currentSessionId = data.session_id;
                                if (wasNew) setTimeout(loadConversationHistory, 500);
                            }
                        }
                    } catch (e) {
                        console.warn("Error parseando chunk SSE", e);
                    }
                }
            }
        }

        // Finalizar y formatear
        finalizeStreamingMessage(botMsgEl, fullText, []);

    } catch (error) {
        hideTypingIndicator();
        console.error('Error al comunicarse con el backend:', error);
        addMessage('assistant', '❌ Error de conexión. Por favor verifica tu conexión a internet e intenta de nuevo.');
    }
}

// Add message to chat con efecto de typing para el asistente
function addMessage(type, content, skipAnimation = false, referencias = [], messageId = null) {
    const message = document.createElement('div');
    message.className = `message ${type}`;
    if (messageId) {
        message.dataset.messageId = messageId;
    }

    // Avatar: imagen para el asistente, letra para el usuario
    const avatarContent = type === 'user'
        ? 'M'
        : '<img src="/static/Hexagono.webp" alt="LegalBot" class="avatar-img">';

    const actionsHTML = type === 'assistant' ? `
        <div class="message-actions hidden-actions">
            <div class="actions-left">
                <button class="action-btn feedback-btn" title="Buen rendimiento" onclick="sendFeedback(this, 'positive')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                    </svg>
                </button>
                <button class="action-btn feedback-btn" title="Mal rendimiento" onclick="sendFeedback(this, 'negative')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
                    </svg>
                </button>
                <button class="action-btn" title="Regenerar respuesta" onclick="regenerateResponse(this)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M23 4v6h-6"></path>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                </button>
                <button class="action-btn" title="Copiar" onclick="copyMessageText(this)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M10 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"></path>
                        <path d="M16 11h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path>
                    </svg>
                </button>
            </div>
            <div class="actions-right">
                <button class="action-btn" title="Más opciones">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="5" r="1.5"></circle>
                        <circle cx="12" cy="12" r="1.5"></circle>
                        <circle cx="12" cy="19" r="1.5"></circle>
                    </svg>
                </button>
            </div>
        </div>
    ` : '';

    message.innerHTML = `
        <div class="message-avatar">${avatarContent}</div>
        <div class="message-body">
            <div class="message-content"></div>
            ${actionsHTML}
        </div>
    `;
    chat.appendChild(message);

    const contentDiv = message.querySelector('.message-content');

    // Guardar contenido original para copiar
    message.dataset.content = content;

    // Guardar referencias si existen
    if (referencias && referencias.length > 0) {
        message.dataset.referencias = JSON.stringify(referencias);
    }

    // Si es mensaje del usuario o se debe saltar animación, mostrar inmediatamente
    if (type === 'user' || skipAnimation) {
        // Procesar pensamiento visible
        const processed = processResponseWithThought(content);

        // Si hay pensamiento, crear el acordeón colapsable
        if (processed.thought && type === 'assistant') {
            // Convertir los guiones y saltos de línea en HTML formateado
            const formattedThought = processed.thought
                .replace(/\n/g, '<br>')
                .replace(/- /g, '• ');

            const thoughtHTML = `
                <div class="thought-container">
                    <details>
                        <summary>
                            Razonando
                        </summary>
                        <div class="thought-content">
                            ${formattedThought}
                        </div>
                    </details>
                </div>
            `;
            contentDiv.innerHTML = thoughtHTML;
        }

        // Formatear y mostrar la respuesta final
        let formattedContent = formatResponseHTML(processed.answer);

        // Si ya hay contenido (el pensamiento), añadir la respuesta después
        if (contentDiv.innerHTML) {
            contentDiv.innerHTML += `<div class="final-answer">${formattedContent}</div>`;
        } else {
            contentDiv.innerHTML = formattedContent;
        }

        // MOSTRAR ACCIONES INMEDIATAMENTE si no hay animación
        const actions = message.querySelector('.message-actions');
        if (actions) {
            actions.classList.remove('hidden-actions');
        }

    } else {
        // Efecto de typing para el asistente
        typeMessage(contentDiv, content, referencias);
    }

    // Scroll inteligente al añadir mensaje
    smartScrollToBottom();

    // Guardar en historial
    conversationHistory.push({ type, content });
}

// Copiar texto del mensaje
function copyMessageText(btn) {
    const msg = btn.closest('.message');
    const text = msg.dataset.content || msg.querySelector('.message-content').innerText;

    navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        btn.title = '¡Copiado!';
        setTimeout(() => {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            btn.title = 'Copiar';
        }, 2000);
    });
}

// ============================================
// EXPORTAR CONVERSACIÓN
// ============================================
function exportConversation() {
    if (conversationHistory.length === 0) {
        alert('No hay conversación para exportar');
        return;
    }

    const date = new Date();
    const dateStr = date.toLocaleDateString('es-PR', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    let content = `════════════════════════════════════════════════════════\n`;
    content += `  LegalBot - Junta de Planificación de Puerto Rico\n`;
    content += `  Fecha: ${dateStr}\n`;
    content += `════════════════════════════════════════════════════════\n\n`;

    conversationHistory.forEach(msg => {
        const role = msg.type === 'user' ? '👤 USUARIO' : '🤖 LEGALBOT';
        content += `${role}:\n${msg.content}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `LegalBot_${date.toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ============================================
// FUNCIONES ELIMINADAS (REFERENCIAS)
// ============================================

// Se eliminó el botón de referencias según solicitud.
// Las referencias siguen llegando del backend pero ya no se muestran en botón aparte.


// ============================================
// NUEVA CONVERSACIÓN
// ============================================
function startNewChat() {
    // Limpiar historial
    conversationHistory = [];
    currentSessionId = null;

    // Limpiar mensajes del chat
    chat.innerHTML = '';
    chat.classList.remove('active');

    // Ocultar área de input del chat
    if (inputArea) inputArea.classList.remove('visible');

    // Mostrar welcome (remover clase hidden)
    welcome.classList.remove('hidden');

    // Limpiar inputs
    if (input) input.value = '';
    if (inputChat) inputChat.value = '';

    // Focus en el input del welcome
    if (input) input.focus();

    // Remover estado activo de conversaciones
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });

    console.log('🆕 Nueva conversación iniciada');
}

// ============================================
// BUSCAR EN HISTORIAL
// ============================================
function searchConversations() {
    const searchTerm = prompt('Buscar en conversaciones:');
    if (!searchTerm || !searchTerm.trim()) return;

    const term = searchTerm.toLowerCase().trim();
    const messages = document.querySelectorAll('.message');
    let found = 0;

    // Remover highlights anteriores
    messages.forEach(msg => {
        msg.classList.remove('search-highlight');
        const content = msg.querySelector('.message-content');
        if (content) {
            content.innerHTML = content.innerHTML.replace(/<mark class="search-mark">(.*?)<\/mark>/g, '$1');
        }
    });

    // Buscar y resaltar
    messages.forEach(msg => {
        const content = msg.querySelector('.message-content');
        if (content && content.textContent.toLowerCase().includes(term)) {
            msg.classList.add('search-highlight');
            found++;
            // Scroll al primer resultado
            if (found === 1) {
                msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });

    if (found === 0) {
        alert(`No se encontraron resultados para "${searchTerm}"`);
    } else {
        console.log(`🔍 ${found} mensaje(s) encontrado(s)`);
    }
}

// ============================================
// FEEDBACK DE RESPUESTA
// ============================================
function feedback(btn, type) {
    const msg = btn.closest('.message');
    const feedbackBtns = msg.querySelectorAll('.action-btn[onclick*="feedback"]');

    // Remover estado activo de otros botones de feedback
    feedbackBtns.forEach(b => {
        b.classList.remove('active', 'positive', 'negative');
        const svg = b.querySelector('svg');
        if (svg) svg.style.fill = 'none';
    });

    // Activar este botón con el tipo correcto
    btn.classList.add('active', type);

    // Rellenar el icono SVG
    const svg = btn.querySelector('svg');
    if (svg) {
        svg.style.fill = 'currentColor';
    }

    console.log(`📊 Feedback ${type} enviado`);

    // Mostrar confirmación temporal
    const originalTitle = btn.title;
    btn.title = type === 'positive' ? '¡Gracias por tu feedback!' : 'Gracias, lo tendremos en cuenta';

    // Efecto de escala
    btn.style.transform = 'scale(1.2)';
    setTimeout(() => {
        btn.style.transform = 'scale(1)';
        setTimeout(() => {
            btn.title = originalTitle;
        }, 1500);
    }, 200);

    // Aquí se puede enviar al servidor si se requiere
    // sendFeedbackToServer(type, msg.dataset.content);
}

// Función para regenerar la respuesta
async function regenerateResponse(btn) {
    const message = btn.closest('.message');
    // Buscar el mensaje del usuario anterior
    let userMessage = message.previousElementSibling;

    while (userMessage && !userMessage.classList.contains('user')) {
        userMessage = userMessage.previousElementSibling;
    }

    if (!userMessage) {
        alert('No se encontró la pregunta original');
        return;
    }

    const userQuestion = userMessage.dataset.content || userMessage.querySelector('.message-content').textContent;

    // Eliminar la respuesta actual
    message.remove();

    // Mostrar indicador de carga
    showTypingIndicator();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: userQuestion,
                reglamento: currentReglamento,
                session_id: currentSessionId,
                regenerate: true
            })
        });

        if (response.status === 401) {
            hideTypingIndicator();
            alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
            window.location.href = '/login';
            return;
        }

        const data = await response.json();

        if (data.respuesta) {
            const processed = processResponseWithThought(data.respuesta);

            if (processed.thought) {
                showThinkingProcess(processed.thought);
                const lines = processed.thought.split('\n').filter(l => l.trim() !== '');
                const avgCharsPerLine = processed.thought.length / lines.length;
                const typingTimePerLine = (avgCharsPerLine * 20) + 150;
                const totalTypingTime = lines.length * typingTimePerLine;
                const readingTime = 1000;
                const totalWaitTime = totalTypingTime + readingTime;
                await new Promise(resolve => setTimeout(resolve, totalWaitTime));
            }

            hideTypingIndicator();
            const referencias = data.referencias || [];
            addMessage('assistant', data.respuesta, false, referencias);
        } else if (data.error) {
            hideTypingIndicator();
            addMessage('assistant', '❌ Error: ' + data.error);
        } else {
            hideTypingIndicator();
            addMessage('assistant', '❌ No se recibió respuesta del servidor');
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('Error regenerando respuesta:', error);
        addMessage('assistant', '❌ Error de conexión. Por favor intenta de nuevo.');
    }
}

async function sendFeedback(btn, type) {
    const msg = btn.closest('.message');
    const messageId = msg.dataset.messageId;

    if (!messageId) {
        console.warn("No message ID found for feedback");
        return;
    }

    const btns = msg.querySelectorAll('.feedback-btn');

    // Remover estado activo de otros botones
    btns.forEach(b => {
        b.classList.remove('active', 'positive', 'negative');
    });

    // Activar este botón con el tipo correcto
    btn.classList.add('active', type);

    // Rellenar el icono SVG
    const svg = btn.querySelector('svg');
    if (svg) {
        svg.style.fill = 'currentColor';
    }

    if (type === 'negative') {
        // Mostrar caja de comentarios si no existe
        if (!msg.querySelector('.feedback-form')) {
            const formHTML = `
                <div class="feedback-form">
                    <textarea class="feedback-textarea" placeholder="¿Por qué esta respuesta no fue útil? (Opcional)" maxlength="500"></textarea>
                    <div class="feedback-actions">
                        <button class="feedback-btn-cancel" onclick="cancelFeedback(this)">Cancelar</button>
                        <button class="feedback-btn-submit" onclick="submitFeedback(this, '${messageId}', '${type}')">Enviar</button>
                    </div>
                </div>
            `;

            // Insertar después del contenido del mensaje y acciones
            const msgBody = msg.querySelector('.message-body');
            const formDiv = document.createElement('div');
            formDiv.innerHTML = formHTML;
            msgBody.appendChild(formDiv.firstElementChild);

            // Focus en textarea
            setTimeout(() => {
                msg.querySelector('.feedback-textarea').focus();
            }, 100);
        }
    } else {
        // Enviar positivo inmediatamente
        submitFeedback(null, messageId, type, null, btn);
    }
}

function cancelFeedback(btn) {
    const form = btn.closest('.feedback-form');
    if (form) form.remove();
}

async function submitFeedback(btn, messageId, type, commentOverride = null, originBtn = null) {
    let comment = commentOverride;
    let form = null;

    if (btn) {
        form = btn.closest('.feedback-form');
        const textarea = form.querySelector('.feedback-textarea');
        comment = textarea.value.trim();

        // Deshabilitar botón
        btn.disabled = true;
        btn.textContent = 'Enviando...';
    }

    try {
        const response = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_id: messageId,
                rating: type,
                comment: comment
            })
        });

        const data = await response.json();

        if (data.success) {
            // Feedback visual
            if (form) {
                form.innerHTML = '<div style="font-size:12px; color:var(--accent-green); padding:4px;">¡Gracias por tu comentario!</div>';
                setTimeout(() => form.remove(), 2000);
            } else if (originBtn) {
                // Animar botón origen
                originBtn.style.transform = 'scale(1.2)';
                setTimeout(() => originBtn.style.transform = 'scale(1)', 200);
            }
        } else {
            if (form) btn.textContent = 'Error';
            console.error('Feedback error:', data.message);
        }
    } catch (e) {
        console.error('Feedback error:', e);
    }
}



// Función para efecto de typing (streaming)
function typeMessage(element, text, referencias = [], speed = 5) {
    // Procesar pensamiento visible primero
    const processed = processResponseWithThought(text);

    // Si hay pensamiento, mostrarlo primero (sin animación)
    if (processed.thought) {
        const formattedThought = processed.thought
            .replace(/\n/g, '<br>')
            .replace(/- /g, '• ');

        const thoughtHTML = `
            <div class="thought-container">
                <details>
                    <summary>
                        Razonando
                    </summary>
                    <div class="thought-content">
                        ${formattedThought}
                    </div>
                </details>
            </div>
        `;
        element.innerHTML = thoughtHTML;
    }

    // Formatear la respuesta final
    let formattedText = formatResponseHTML(processed.answer);

    // Crear un elemento temporal para parsear el HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedText;

    // Obtener el texto plano y los nodos HTML
    const htmlContent = tempDiv.innerHTML;

    let currentIndex = 0;
    let displayedHTML = '';
    let isInsideTag = false;
    let currentTag = '';

    // Crear contenedor para la respuesta final
    const answerDiv = document.createElement('div');
    answerDiv.className = 'final-answer';

    // Agregar cursor parpadeante
    answerDiv.innerHTML = '<span class="typing-cursor">|</span>';

    // Si ya hay contenido (el pensamiento), añadir después
    if (element.innerHTML) {
        element.appendChild(answerDiv);
    } else {
        element.innerHTML = '';
        element.appendChild(answerDiv);
    }

    const typeInterval = setInterval(() => {
        if (currentIndex < htmlContent.length) {
            const char = htmlContent[currentIndex];

            // Detectar inicio de etiqueta HTML
            if (char === '<') {
                isInsideTag = true;
                currentTag = '';
            }

            if (isInsideTag) {
                currentTag += char;
                if (char === '>') {
                    isInsideTag = false;
                    displayedHTML += currentTag;
                    currentTag = '';
                }
            } else {
                displayedHTML += char;
            }

            // Actualizar contenido con cursor
            answerDiv.innerHTML = displayedHTML + '<span class="typing-cursor">|</span>';

            // Scroll INTELIGENTE mientras escribe (solo si está abajo)
            smartScrollToBottom();

            currentIndex++;
        } else {
            // Terminar animación
            clearInterval(typeInterval);
            answerDiv.innerHTML = displayedHTML;

            // Mostrar acciones si existen (ROBUSTO)
            let actions = answerDiv.parentElement.querySelector('.message-actions');
            if (!actions) {
                // Fallback: buscar en todo el mensaje
                const msgContainer = answerDiv.closest('.message');
                if (msgContainer) {
                    actions = msgContainer.querySelector('.message-actions');
                }
            }

            if (actions) {
                actions.classList.remove('hidden-actions');
                actions.style.display = 'flex'; // Forzar display flex por si acaso
            }

        }
    }, speed);
}

// Typing indicator - Ahora muestra pensamiento en tiempo real
function showTypingIndicator() {
    let indicator = document.getElementById('typingIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'typingIndicator';
        indicator.className = 'message assistant thinking';
        indicator.innerHTML = `
            <div class="message-avatar thinking-avatar">
                <img src="/static/Hexagono.webp" alt="LegalBot" class="avatar-img thinking">
            </div>
            <div class="message-content thinking-text">
                <div class="thinking-header">
                    <span>Razonando</span>
                    <span class="thinking-dots">...</span>
                </div>
            </div>
        `;
        chat.appendChild(indicator);
    }
    indicator.style.display = 'flex';

    // Scroll to bottom
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Actualiza el label del typing indicator (para SSE streaming)
function updateTypingStatus(statusText) {
    const indicator = document.getElementById('typingIndicator');
    if (!indicator) return;
    const span = indicator.querySelector('.thinking-header span:first-child');
    if (span) span.textContent = statusText;
}

// Crea el div del mensaje del asistente para ir llenando token a token
function createStreamingBotMessage() {
    const message = document.createElement('div');
    message.className = 'message assistant';
    message.innerHTML = `
        <div class="message-avatar">
            <img src="/static/Hexagono.webp" alt="LegalBot" class="avatar-img">
        </div>
        <div class="message-body">
            <div class="message-content"></div>
            <div class="message-actions hidden-actions">
                <div class="actions-left">
                    <button class="action-btn feedback-btn" title="Buen rendimiento" onclick="sendFeedback(this, 'positive')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                    </button>
                    <button class="action-btn feedback-btn" title="Mal rendimiento" onclick="sendFeedback(this, 'negative')">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>
                    </button>
                    <button class="action-btn" title="Regenerar respuesta" onclick="regenerateResponse(this)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                    </button>
                    <button class="action-btn" title="Copiar" onclick="copyMessageText(this)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M10 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"></path><path d="M16 11h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path></svg>
                    </button>
                </div>
                <div class="actions-right">
                    <button class="action-btn" title="Más opciones">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
                    </button>
                </div>
            </div>
        </div>
    `;
    chat.appendChild(message);
    smartScrollToBottom();
    return message;
}

// Finaliza el mensaje streameado: procesa <analisis>, referencias y muestra acciones
function finalizeStreamingMessage(msgEl, fullText, referencias) {
    const contentDiv = msgEl.querySelector('.message-content');
    if (!contentDiv) return;

    const processed = processResponseWithThought(fullText);
    let html = '';

    if (processed.thought) {
        const formattedThought = processed.thought
            .replace(/\n/g, '<br>')
            .replace(/- /g, '• ');
        html += `<div class="thought-container"><details><summary>Razonando</summary><div class="thought-content">${formattedThought}</div></details></div>`;
        html += `<div class="final-answer">${formatResponseHTML(processed.answer)}</div>`;
    } else {
        html = formatResponseHTML(processed.answer);
    }

    contentDiv.innerHTML = html;
    msgEl.dataset.content = fullText;
    if (referencias && referencias.length > 0) {
        msgEl.dataset.referencias = JSON.stringify(referencias);
    }

    const actions = msgEl.querySelector('.message-actions');
    if (actions) actions.classList.remove('hidden-actions');

    conversationHistory.push({ type: 'assistant', content: fullText });
    smartScrollToBottom();
}

// Nueva función: Mostrar pensamiento en tiempo real con efecto typing
function showThinkingProcess(thoughtContent) {
    const indicator = document.getElementById('typingIndicator');
    if (!indicator) return;

    const contentDiv = indicator.querySelector('.message-content');
    if (!contentDiv) return;

    // Crear estructura inicial
    contentDiv.innerHTML = `
        <div class="thought-container active-thinking">
            <div class="thinking-header">
            </div>
            <div class="thought-content live" id="liveThoughtContent">
            </div>
        </div>
    `;

    // Obtener el contenedor donde se escribirá el pensamiento
    const liveContent = document.getElementById('liveThoughtContent');

    // Dividir el pensamiento en líneas
    const lines = thoughtContent.split('\n').filter(line => line.trim() !== '');

    // Función para escribir una línea con efecto typing
    function typeThoughtLine(lineText, lineIndex) {
        return new Promise((resolve) => {
            // Crear el elemento de la línea
            const lineDiv = document.createElement('div');
            lineDiv.className = 'thought-line';
            lineDiv.style.opacity = '0';
            liveContent.appendChild(lineDiv);

            // Formatear la línea (convertir guiones en bullets)
            const formattedLine = lineText.replace(/^- /, '• ');

            let currentChar = 0;

            // Fade in del elemento
            setTimeout(() => {
                lineDiv.style.opacity = '1';
                lineDiv.style.transition = 'opacity 0.2s ease-in';
            }, 10);

            // Efecto typing caracter por caracter
            const typingInterval = setInterval(() => {
                if (currentChar < formattedLine.length) {
                    lineDiv.textContent = formattedLine.substring(0, currentChar + 1);
                    currentChar++;

                    // Scroll automático INTELIGENTE (solo si está abajo)
                    smartScrollToBottom();
                } else {
                    clearInterval(typingInterval);
                    // Pequeña pausa antes de la siguiente línea
                    setTimeout(resolve, 150);
                }
            }, 5); // Velocidad de typing: 20ms por caracter speed
        });
    }

    // Escribir todas las líneas secuencialmente
    async function typeAllLines() {
        for (let i = 0; i < lines.length; i++) {
            await typeThoughtLine(lines[i], i);
        }
    }

    // Iniciar el typing
    typeAllLines();

    // Scroll to bottom
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove(); // Remover completamente para que se cree nuevo cada vez
    }
}

// New chat
function newChat() {
    chat.innerHTML = '';
    chat.classList.remove('active');
    welcome.classList.remove('hidden');
    if (inputArea) inputArea.classList.remove('visible');

    // Clear both inputs
    input.value = '';
    if (inputChat) inputChat.value = '';

    conversationHistory = [];
    currentSessionId = null;

    // Update active state
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });

    // Focus on welcome input
    if (input) input.focus();
}

// Logout function
async function logout() {
    if (!confirm('¿Estás seguro que deseas cerrar sesión?')) {
        return;
    }

    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = data.redirect || '/login';
        } else {
            alert('Error al cerrar sesión: ' + data.message);
        }
    } catch (error) {
        console.error('Error:', error);
        window.location.href = '/login';
    }
}

// Close sidebar on mobile when clicking outside
document.addEventListener('click', function (e) {
    if (window.innerWidth <= 768) {
        if (!sidebar.contains(e.target) && !e.target.closest('.show-sidebar-btn')) {
            if (!sidebar.classList.contains('collapsed')) {
                toggleSidebar();
            }
        }
    }
});

// Add CSS for typing indicator animation and conversation list
const style = document.createElement('style');
style.textContent = `
    .typing-dot {
        width: 8px;
        height: 8px;
        background: var(--text-tertiary);
        border-radius: 50%;
        display: inline-block;
        animation: typingBounce 1.4s infinite ease-in-out both;
    }
    .typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .typing-dot:nth-child(2) { animation-delay: -0.16s; }
    .typing-dot:nth-child(3) { animation-delay: 0s; }
    
    @keyframes typingBounce {
        0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
        40% { transform: scale(1); opacity: 1; }
    }
    
    .typing-dots {
        display: flex;
        gap: 4px;
    }
`;
document.head.appendChild(style);

// ============================================
// SISTEMA DE PARTÍCULAS INTERACTIVAS (Estilo Antigravity)
// ============================================

// Variables globales para partículas
let particlesCanvas, particlesCtx;
let particulas = [];
let ancho, alto;
const raton = { x: null, y: null };

// Configuración de partículas - Modo SUTIL/PROFESIONAL
const configParticulas = {
    cantidad: 40,              // Menos partículas (antes: 80)
    distanciaConexion: 150,    // Conexiones más largas y sutiles
    radioRaton: 120,           // Radio de interacción más pequeño
    opacidadParticula: 0.4,    // Partículas más transparentes
    opacidadLinea: 0.15,       // Líneas más sutiles
    velocidadBase: 0.8,        // Movimiento más lento y elegante
    // Efecto de explosión
    explosion: {
        activa: false,
        x: 0,
        y: 0,
        fuerza: 0,
        radio: 500
    }
};

// Obtener color de partículas - Ocean Theme (Azul)
function getParticleRGB() {
    return '37, 99, 235'; // Azul Ocean
}

// Clase Partícula
class Particula {
    constructor() {
        this.x = Math.random() * ancho;
        this.y = Math.random() * alto;
        // Velocidad más lenta y elegante
        this.vx = (Math.random() - 0.5) * configParticulas.velocidadBase;
        this.vy = (Math.random() - 0.5) * configParticulas.velocidadBase;
        this.tamano = Math.random() * 1.5 + 0.5; // Partículas más pequeñas
    }

    actualizar() {
        // Movimiento normal
        this.x += this.vx;
        this.y += this.vy;

        // Rebote en bordes
        if (this.x < 0 || this.x > ancho) this.vx *= -1;
        if (this.y < 0 || this.y > alto) this.vy *= -1;

        // EFECTO EXPLOSIÓN - Empuja partículas hacia afuera
        if (configParticulas.explosion.activa) {
            let dx = this.x - configParticulas.explosion.x;
            let dy = this.y - configParticulas.explosion.y;
            let distancia = Math.sqrt(dx * dx + dy * dy);

            if (distancia < configParticulas.explosion.radio && distancia > 0) {
                const fuerza = configParticulas.explosion.fuerza * (1 - distancia / configParticulas.explosion.radio);
                const direccionX = dx / distancia;
                const direccionY = dy / distancia;
                // Empujar HACIA AFUERA (explosión)
                this.x += direccionX * fuerza;
                this.y += direccionY * fuerza;
            }
        }

        // Interacción con el Mouse (Efecto Antigravedad - ATRACCIÓN) - Más suave
        if (raton.x !== null && raton.y !== null) {
            let dx = raton.x - this.x;
            let dy = raton.y - this.y;
            let distancia = Math.sqrt(dx * dx + dy * dy);

            if (distancia < configParticulas.radioRaton && distancia > 0) {
                const fuerza = (configParticulas.radioRaton - distancia) / configParticulas.radioRaton;
                const direccionX = dx / distancia;
                const direccionY = dy / distancia;
                // Atracción más suave
                this.x += direccionX * fuerza * 1.2;
                this.y += direccionY * fuerza * 1.2;
            }
        }
    }

    dibujar() {
        const color = getParticleRGB();
        particlesCtx.beginPath();
        particlesCtx.arc(this.x, this.y, this.tamano, 0, Math.PI * 2);
        // Usar opacidad configurada
        particlesCtx.fillStyle = `rgba(${color}, ${configParticulas.opacidadParticula})`;
        particlesCtx.fill();
    }
}

// Obtener el ancho del sidebar
function getSidebarWidth() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
        return 260; // --sidebar-width
    }
    return 0;
}

// 🎆 EFECTO EXPLOSIÓN - Dispara una onda expansiva desde un punto
function triggerExplosion(centerX, centerY) {
    const sidebarWidth = getSidebarWidth();

    // Ajustar coordenadas al canvas
    configParticulas.explosion.x = centerX - sidebarWidth;
    configParticulas.explosion.y = centerY;
    configParticulas.explosion.fuerza = 15; // Fuerza inicial
    configParticulas.explosion.activa = true;

    // Animar la disminución de la fuerza
    let frames = 0;
    const maxFrames = 30;

    function animarExplosion() {
        frames++;
        configParticulas.explosion.fuerza = 15 * (1 - frames / maxFrames);

        if (frames < maxFrames) {
            requestAnimationFrame(animarExplosion);
        } else {
            configParticulas.explosion.activa = false;
            configParticulas.explosion.fuerza = 0;
        }
    }

    animarExplosion();
}

// Estado de visibilidad de las partículas
let particulasVisibles = true;
let animacionEnProgreso = false;

// 🌀 IMPLOSIÓN - Absorbe las partículas hacia el logo (efecto agujero negro)
function triggerImplosion(centerX, centerY) {
    if (animacionEnProgreso) return;
    animacionEnProgreso = true;

    const sidebarWidth = getSidebarWidth();
    const targetX = centerX - sidebarWidth;
    const targetY = centerY;

    let frames = 0;
    const maxFrames = 60; // ~1 segundo a 60fps

    function animarAbsorcion() {
        frames++;
        const progreso = frames / maxFrames;
        const easeIn = progreso * progreso * progreso; // Aceleración exponencial

        // Mover cada partícula hacia el centro
        particulas.forEach(p => {
            const dx = targetX - p.x;
            const dy = targetY - p.y;
            // Acelera conforme se acerca al final
            p.x += dx * easeIn * 0.15;
            p.y += dy * easeIn * 0.15;
            // Reducir tamaño gradualmente
            p.tamano = p.tamano * (1 - easeIn * 0.03);
        });

        // Fade out gradual
        if (particlesCanvas) {
            particlesCanvas.style.opacity = String(1 - easeIn);
        }

        if (frames < maxFrames) {
            requestAnimationFrame(animarAbsorcion);
        } else {
            // Finalizar
            particulasVisibles = false;
            animacionEnProgreso = false;
            if (particlesCanvas) {
                particlesCanvas.style.opacity = '0';
            }
        }
    }

    animarAbsorcion();
}

// 💥 BIG BANG - Las partículas nacen del centro y explotan hacia afuera
function triggerBigBang(centerX, centerY) {
    if (animacionEnProgreso) return;
    animacionEnProgreso = true;

    const sidebarWidth = getSidebarWidth();
    const origenX = centerX - sidebarWidth;
    const origenY = centerY;

    // Colocar TODAS las partículas en el centro
    particulas.forEach(p => {
        p.x = origenX;
        p.y = origenY;
        p.tamano = 0.5; // Empezar pequeñas
        // Dar velocidad aleatoria hacia afuera (Big Bang)
        const angulo = Math.random() * Math.PI * 2;
        const velocidad = 5 + Math.random() * 10;
        p.vx = Math.cos(angulo) * velocidad;
        p.vy = Math.sin(angulo) * velocidad;
    });

    // Mostrar canvas
    if (particlesCanvas) {
        particlesCanvas.style.opacity = '1';
    }
    particulasVisibles = true;

    let frames = 0;
    const maxFrames = 90; // ~1.5 segundos

    function animarBigBang() {
        frames++;
        const progreso = frames / maxFrames;
        const easeOut = 1 - Math.pow(1 - progreso, 3); // Desaceleración

        particulas.forEach(p => {
            // Aplicar velocidad de explosión (desacelera con el tiempo)
            p.x += p.vx * (1 - easeOut * 0.8);
            p.y += p.vy * (1 - easeOut * 0.8);

            // Crecer gradualmente hasta tamaño normal
            const tamanoFinal = Math.random() * 2 + 1;
            p.tamano = Math.min(p.tamano + 0.05, tamanoFinal);

            // Reducir velocidad de explosión gradualmente
            p.vx *= 0.97;
            p.vy *= 0.97;
        });

        if (frames < maxFrames) {
            requestAnimationFrame(animarBigBang);
        } else {
            // Restaurar velocidades normales
            particulas.forEach(p => {
                p.vx = (Math.random() - 0.5) * 1.5;
                p.vy = (Math.random() - 0.5) * 1.5;
                p.tamano = Math.random() * 2 + 1;
            });
            animacionEnProgreso = false;
        }
    }

    animarBigBang();
}

// Conectar el logo con el toggle de partículas
function setupLogoExplosion() {
    const logo = document.querySelector('.welcome-logo');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.title = 'Click para activar/desactivar partículas ✨';

        logo.addEventListener('click', (e) => {
            if (animacionEnProgreso) return; // Evitar spam de clicks

            const rect = logo.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            if (particulasVisibles) {
                // 🌀 Absorber hacia el logo
                triggerImplosion(centerX, centerY);
            } else {
                // 💥 Big Bang desde el logo
                triggerBigBang(centerX, centerY);
            }
        });
    }
}

function initParticulas() {
    particlesCanvas = document.getElementById('particlesCanvas');
    if (!particlesCanvas) return false;

    particlesCtx = particlesCanvas.getContext('2d');
    particulas = [];

    const sidebarWidth = getSidebarWidth();
    ancho = particlesCanvas.width = window.innerWidth - sidebarWidth;
    alto = particlesCanvas.height = window.innerHeight;

    for (let i = 0; i < configParticulas.cantidad; i++) {
        particulas.push(new Particula());
    }
    return true;
}

function animarParticulas() {
    // Verificar si el tema es Christmas (tema está en html, no en body)
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    if (theme === 'christmas') {
        particlesCtx.clearRect(0, 0, ancho, alto);
        requestAnimationFrame(animarParticulas);
        return;
    }

    particlesCtx.clearRect(0, 0, ancho, alto);
    const color = getParticleRGB();

    for (let i = 0; i < particulas.length; i++) {
        let p = particulas[i];
        p.actualizar();
        p.dibujar();

        // Dibujar líneas entre partículas cercanas (más sutiles)
        for (let j = i + 1; j < particulas.length; j++) {
            let p2 = particulas[j];
            let dx = p.x - p2.x;
            let dy = p.y - p2.y;
            let distancia = Math.sqrt(dx * dx + dy * dy);

            if (distancia < configParticulas.distanciaConexion) {
                particlesCtx.beginPath();
                // Usar opacidad configurada para líneas más sutiles
                const opacidad = configParticulas.opacidadLinea * (1 - distancia / configParticulas.distanciaConexion);
                particlesCtx.strokeStyle = `rgba(${color}, ${opacidad})`;
                particlesCtx.lineWidth = 0.3; // Líneas más finas
                particlesCtx.moveTo(p.x, p.y);
                particlesCtx.lineTo(p2.x, p2.y);
                particlesCtx.stroke();
            }
        }
    }
    requestAnimationFrame(animarParticulas);
}

// Event listeners para partículas
function setupParticleEvents() {
    window.addEventListener('mousemove', (e) => {
        // Ajustar coordenadas restando el ancho del sidebar
        const sidebarWidth = getSidebarWidth();
        raton.x = e.clientX - sidebarWidth;
        raton.y = e.clientY;
    });

    window.addEventListener('mouseout', () => {
        raton.x = null;
        raton.y = null;
    });

    window.addEventListener('resize', () => {
        if (particlesCanvas) {
            const sidebarWidth = getSidebarWidth();
            ancho = particlesCanvas.width = window.innerWidth - sidebarWidth;
            alto = particlesCanvas.height = window.innerHeight;
            particulas = [];
            for (let i = 0; i < configParticulas.cantidad; i++) {
                particulas.push(new Particula());
            }
        }
    });
}

// Inicialización
document.addEventListener('DOMContentLoaded', function () {
    // Inicializar referencias a elementos del DOM
    sidebar = document.getElementById('sidebar');
    input = document.getElementById('input');
    inputChat = document.getElementById('inputChat');
    inputArea = document.getElementById('inputArea');
    welcome = document.getElementById('welcome');
    chat = document.getElementById('chat');
    settingsMenu = document.getElementById('settingsMenu');

    // Configurar event listeners para los inputs (IMPORTANTE: debe hacerse después de obtener los elementos)
    setupTextareaResize(input);
    setupTextareaResize(inputChat);

    // Cargar tema guardado
    try {
        loadSavedTheme();
    } catch (error) {
        console.error('❌ Error cargando tema:', error);
    }

    // Actualizar indicador visual del tema actual
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'system';
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    const activeOption = document.querySelector(`.theme-option[data-theme="${activeTheme}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
    } else {
        // Si no hay tema específico, marcar "Sistema" como activo
        document.querySelector('.theme-option[data-theme="system"]')?.classList.add('active');
    }

    if (document.getElementById('sidebar')) {
        // Cargar historial de conversaciones
        loadConversationHistory();
    }

    // Inicializar sistema de partículas
    if (initParticulas()) {
        setupParticleEvents();
        setupLogoExplosion(); // Conectar el logo con el efecto de explosión
        animarParticulas();
        console.log('✨ Sistema de partículas inicializado');
    }

    // Verificar si el tema es Christmas para activar nieve
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'christmas') {
        startSnowfall();
    }

    console.log('LegalBot Claude Style - Conectado con IA, Historial y Partículas Antigravity');
});

// ============================================
// EFECTO DE NIEVE NAVIDEÑA ❄️
// ============================================
let snowContainer = null;
let snowInterval = null;

function startSnowfall() {
    if (snowContainer) return; // Ya está activo

    // Crear contenedor de nieve
    snowContainer = document.createElement('div');
    snowContainer.id = 'snowfall';
    snowContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
        overflow: hidden;
    `;
    document.body.appendChild(snowContainer);

    // Crear copos iniciales
    for (let i = 0; i < 30; i++) {
        setTimeout(() => createSnowflake(), i * 100);
    }

    // Seguir creando copos
    snowInterval = setInterval(createSnowflake, 200);

    console.log('❄️ Efecto de nieve activado');
}

function stopSnowfall() {
    if (snowInterval) {
        clearInterval(snowInterval);
        snowInterval = null;
    }
    if (snowContainer) {
        snowContainer.remove();
        snowContainer = null;
    }
    console.log('❄️ Efecto de nieve desactivado');
}

function createSnowflake() {
    if (!snowContainer) return;

    const snowflake = document.createElement('div');
    const size = Math.random() * 12 + 10; // 10-22px (más grandes)
    const startX = Math.random() * 100;
    const duration = Math.random() * 4 + 4; // 4-8s
    const delay = Math.random() * 1;

    // Variedad de copos
    const flakes = ['❄', '❅', '❆', '✻', '✼'];
    snowflake.innerHTML = flakes[Math.floor(Math.random() * flakes.length)];

    snowflake.style.cssText = `
        position: absolute;
        left: ${startX}%;
        top: -30px;
        font-size: ${size}px;
        color: #a8d4ff;
        text-shadow: 0 0 10px #fff, 0 0 20px #87ceeb, 0 0 30px #87ceeb;
        animation: snowfall ${duration}s linear ${delay}s forwards;
        opacity: 1;
        filter: drop-shadow(0 0 3px #fff);
    `;

    snowContainer.appendChild(snowflake);

    // Remover después de la animación
    setTimeout(() => {
        if (snowflake.parentNode) {
            snowflake.remove();
        }
    }, (duration + delay) * 1000);
}

// CSS para la animación de nieve
const snowStyle = document.createElement('style');
snowStyle.textContent = `
    @keyframes snowfall {
        0% {
            transform: translateY(0) rotate(0deg) translateX(0);
            opacity: 1;
        }
        25% {
            transform: translateY(25vh) rotate(90deg) translateX(10px);
        }
        50% {
            transform: translateY(50vh) rotate(180deg) translateX(-10px);
        }
        75% {
            transform: translateY(75vh) rotate(270deg) translateX(10px);
        }
        100% {
            transform: translateY(105vh) rotate(360deg) translateX(-10px);
            opacity: 0.3;
        }
    }
`;
document.head.appendChild(snowStyle);
// Variables globales
let isLoading = false;

// Función principal de login
async function handleLogin(event) {
    event.preventDefault();

    if (isLoading) return;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    // Validaciones básicas
    if (!username || !password) {
        showMessage('Por favor completa todos los campos.', 'error');
        return;
    }

    // Mostrar estado de carga
    setLoadingState(true);
    clearMessages();

    try {
        // Llamada al backend
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Login exitoso
            showMessage('Iniciando sesión...', 'success');

            // Redirigir después de un momento
            setTimeout(() => {
                window.location.href = data.redirect || '/';
            }, 1000);
        } else {
            // Error en login
            showMessage(data.message || 'Credenciales incorrectas. Inténtalo de nuevo.', 'error');
        }
    } catch (error) {
        console.error('Error en login:', error);
        showMessage('Error de conexión. Inténtalo de nuevo.', 'error');
    } finally {
        setLoadingState(false);
    }
}

// Mostrar mensajes (consolidado para login y change password)
function showMessage(message, type = 'error') {
    const container = document.getElementById('messageContainer');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = `
        <div class="message ${type}-message">
            ${type === 'error' ?
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        }
            ${message}
        </div>
    `;
}

// Limpiar mensajes
function clearMessages() {
    document.getElementById('messageContainer').innerHTML = '';
}

// Estado de carga
function setLoadingState(loading) {
    isLoading = loading;
    const btn = document.getElementById('loginBtn');
    const btnText = document.getElementById('btnText');
    const form = document.getElementById('loginForm');

    if (loading) {
        btn.disabled = true;
        btnText.innerHTML = '<span class="loading-spinner"></span>Iniciando sesión...';
        form.style.opacity = '0.7';
    } else {
        btn.disabled = false;
        btnText.textContent = 'Iniciar Sesión';
        form.style.opacity = '1';
    }
}

// Olvidé mi contraseña
function showForgotPassword() {
    window.location.href = '/change-password';
}

// Manejo de teclas
document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !isLoading) {
        const activeElement = document.activeElement;
        if (activeElement.tagName === 'INPUT') {
            handleLogin(event);
        }
    }
});

// Auto-focus en el campo de usuario (solo en página de login)
document.addEventListener('DOMContentLoaded', function () {
    const usernameLoginField = document.getElementById('username');
    if (usernameLoginField) {
        usernameLoginField.focus();

        // Limpiar mensajes al escribir
        const inputs = document.querySelectorAll('.form-input');
        inputs.forEach(input => {
            input.addEventListener('input', clearMessages);
        });

        console.log('Login page cargada correctamente');
    }
});

// Función para demo/testing (eliminar en producción)
function demoLogin() {
    document.getElementById('username').value = 'admin';
    document.getElementById('password').value = 'admin123';
}

// Detectar Enter en campos de entrada (solo si existen - página de login)
const usernameField = document.getElementById('username');
const passwordField = document.getElementById('password');

if (usernameField) {
    usernameField.addEventListener('keypress', function (event) {
        if (event.key === 'Enter' && passwordField) {
            passwordField.focus();
        }
    });
}

if (passwordField) {
    passwordField.addEventListener('keypress', function (event) {
        if (event.key === 'Enter') {
            handleLogin(event);
        }
    });
}
async function handleChangePassword(event) {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const btn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');

    // Validaciones
    if (!email) {
        showMessage('Por favor ingresa tu email o usuario.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showMessage('Las nuevas contraseñas no coinciden.', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showMessage('La contraseña debe tener al menos 8 caracteres.', 'error');
        return;
    }

    if (currentPassword === newPassword) {
        showMessage('La nueva contraseña no puede ser igual a la anterior.', 'error');
        return;
    }

    // Estado de carga
    btn.disabled = true;
    btnText.innerHTML = '<div class="spinner"></div> Procesando...';

    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: email,
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage('Contraseña actualizada correctamente.', 'success');
            document.getElementById('changePasswordForm').reset();
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } else {
            showMessage(data.message || 'Error al actualizar la contraseña.', 'error');
        }
    } catch (error) {
        console.error('Error:', error);

        // SIMULACIÓN DE ÉXITO para visualización (Usuario pidió el archivo, el backend es secundario por ahora)
        console.warn("Simulando fallo por falta de endpoint");
        setTimeout(() => {
            showMessage('Error: No se pudo conectar con el servidor para cambiar la contraseña.', 'error');
        }, 1000);
    } finally {
        btn.disabled = false;
        if (!document.querySelector('.success-message')) {
            btnText.textContent = 'Actualizar Contraseña';
        }
    }
}

// Config Page JavaScript
// Maneja la configuración de LegalBot

// ============================================
// SISTEMA DE TEMAS
// ============================================

// Cargar tema guardado al iniciar
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('legalbot-theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeSelection(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeSelection('system');
    } else {
        updateThemeSelection('light');
    }
}

// Actualizar selección visual del tema
function updateThemeSelection(theme) {
    document.querySelectorAll('.color-mode-option').forEach(option => {
        option.classList.remove('active');
        if (option.dataset.theme === theme) {
            option.classList.add('active');
        }
    });
}


// ============================================
// NAVEGACIÓN
// ============================================

// Cerrar configuración y volver al chat
function closeSettings() {
    window.location.href = '/';
}

// Navegación del sidebar
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function () {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            // Aquí podrías cargar diferentes secciones via AJAX
            const section = this.textContent.trim();
            console.log(`Navegando a: ${section}`);
        });
    });
}

// ============================================
// COLOR MODE OPTIONS
// ============================================

function initColorModeOptions() {
    document.querySelectorAll('.color-mode-option').forEach(option => {
        option.addEventListener('click', function () {
            const theme = this.dataset.theme;
            setTheme(theme);
        });
    });
}

// ============================================
// CONFIGURACIONES
// ============================================

// Guardar reglamento predeterminado
function initReglamentoSelect() {
    const reglamentoSelect = document.getElementById('reglamentoSelect');
    if (reglamentoSelect) {
        // Cargar valor guardado
        const savedReglamento = localStorage.getItem('legalbot-reglamento');
        if (savedReglamento) {
            reglamentoSelect.value = savedReglamento;
        }

        reglamentoSelect.addEventListener('change', function () {
            localStorage.setItem('legalbot-reglamento', this.value);
            console.log('📚 Reglamento cambiado a:', this.value);
        });
    }
}

// Guardar nivel de detalle
function initDetailLevel() {
    const detailSelect = document.getElementById('detailSelect');
    if (detailSelect) {
        const savedDetail = localStorage.getItem('legalbot-detail');
        if (savedDetail) {
            detailSelect.value = savedDetail;
        }

        detailSelect.addEventListener('change', function () {
            localStorage.setItem('legalbot-detail', this.value);
            console.log('📝 Nivel de detalle cambiado a:', this.value);
        });
    }
}

// Toggle switches para notificaciones
function initToggles() {
    document.querySelectorAll('.toggle-switch input').forEach(toggle => {
        const key = toggle.id || toggle.name;

        // Cargar estado guardado
        const savedState = localStorage.getItem(`legalbot-toggle-${key}`);
        if (savedState !== null) {
            toggle.checked = savedState === 'true';
        }

        toggle.addEventListener('change', function () {
            localStorage.setItem(`legalbot-toggle-${key}`, this.checked);
            console.log(`🔔 Toggle ${key}:`, this.checked);
        });
    });
}

// ============================================
// ATAJOS DE TECLADO
// ============================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        // Ctrl+. para cerrar
        if (e.ctrlKey && e.key === '.') {
            e.preventDefault();
            closeSettings();
        }
        // Escape para cerrar
        if (e.key === 'Escape') {
            closeSettings();
        }
    });
}

// ============================================
// FUNCIONES DE ACCIÓN PARA EL ASISTENTE (GEMINI)
// ============================================

function feedback(btn, type) {
    if (btn.classList.contains('active')) return;

    const parent = btn.closest('.actions-left');
    parent.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));

    btn.classList.add('active');
    console.log(`📡 Feedback ${type} enviado`);
}

function copyMessageText(btn) {
    const messageDiv = btn.closest('.message');
    const contentDiv = messageDiv.querySelector('.message-content');
    const textToCopy = messageDiv.dataset.content || contentDiv.innerText;

    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34a853" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        setTimeout(() => {
            btn.innerHTML = originalHTML;
        }, 2000);
    });
}

function regenerateResponse(btn) {
    const messageDiv = btn.closest('.message');
    let current = messageDiv.previousElementSibling;
    while (current && !current.classList.contains('user')) {
        current = current.previousElementSibling;
    }

    if (current) {
        const lastQuery = current.dataset.content || current.querySelector('.message-content').innerText;
        const inputArea = document.getElementById('input');
        if (inputArea) {
            inputArea.value = lastQuery;
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) {
                sendBtn.click();
            }
        }
    }
}

// Función para mostrar alerta de desarrollo (Una vez por sesión)
function showDevelopmentAlert() {
    // Solo mostrar si es la página de chat
    if (!document.getElementById('customModal')) return;

    const modal = document.getElementById('customModal');
    const title = document.getElementById('modalTitle');
    const message = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const modalIcon = document.getElementById('modalIcon');

    // Configurar modal para alerta de desarrollo
    const originalTitle = title.textContent;
    const originalMessage = message.innerHTML;
    const originalConfirmText = confirmBtn.textContent;
    const originalCancelDisplay = cancelBtn.style.display;

    title.textContent = 'Proyecto en Desarrollo';
    message.innerHTML = 'Este proyecto se encuentra actualmente en fase de desarrollo.<br><br>Por favor, <strong>coteje todas las respuestas</strong> con el contenido oficial del Reglamento Conjunto.';

    confirmBtn.textContent = 'Entendido';
    confirmBtn.classList.remove('danger');
    cancelBtn.style.display = 'none';
    if (modalIcon) modalIcon.style.display = 'none';

    // Mostrar modal
    modal.classList.add('active');

    // Handler para cerrar y restaurar
    const handleClose = () => {
        modal.classList.remove('active');
        sessionStorage.setItem('legalbot-dev-alert-shown', 'true');

        // Restaurar estado original del modal para otros usos después de la animación
        setTimeout(() => {
            title.textContent = originalTitle;
            message.innerHTML = originalMessage;
            confirmBtn.textContent = originalConfirmText;
            confirmBtn.classList.add('danger');
            cancelBtn.style.display = originalCancelDisplay;
            if (modalIcon) modalIcon.style.display = 'none'; // El icono suele estar oculto
        }, 300);

        confirmBtn.removeEventListener('click', handleClose);
    };

    confirmBtn.addEventListener('click', handleClose);
}

// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    // === INICIALIZACIÓN DEL CHAT PRINCIPAL ===
    // Inicializar variables DOM
    sidebar = document.getElementById('sidebar');
    input = document.getElementById('input');
    inputChat = document.getElementById('inputChat');
    inputArea = document.getElementById('inputArea');
    welcome = document.getElementById('welcome');
    chat = document.getElementById('chat');
    settingsMenu = document.getElementById('settingsMenu');

    // Solo inicializar chat si estamos en la página principal
    const isMainChatPage = sidebar && input && chat;

    if (isMainChatPage) {
        // Configurar auto-resize de textareas
        if (input) setupTextareaResize(input);
        if (inputChat) setupTextareaResize(inputChat);

        // Cargar historial de conversaciones
        loadConversationHistory();

        // Mostrar alerta de desarrollo
        setTimeout(showDevelopmentAlert, 1000);

        console.log('✅ LegalBot Chat inicializado correctamente');
    }

    // Cargar tema guardado (siempre)
    loadSavedTheme();

    // === INICIALIZACIÓN DE CONFIGURACIÓN (si existe) ===
    initNavigation();
    initColorModeOptions();
    initReglamentoSelect();
    initDetailLevel();
    initToggles();
    initKeyboardShortcuts();

    console.log('⚙️ Página inicializada');
});

// ============================================
// VERIFICACIÓN DE DOS FACTORES (2FA)
// ============================================

async function handleVerification(event) {
    event.preventDefault();
    const codeInput = document.getElementById('verificationCode');
    const code = codeInput ? codeInput.value : '';
    const btn = document.getElementById('verifyBtn');

    if (!btn) return;

    const originalText = btn.innerHTML;

    // Mostrar estado de carga
    btn.innerHTML = '<span class="loader"></span> Verificando...';
    btn.disabled = true;

    try {
        // Aquí iría la llamada al backend
        const response = await fetch('/verify-2fa', { // Asumiendo ruta /verify-2fa
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code: code })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            window.location.href = data.redirect || '/';
        } else {
            const msg = data.message || 'Código incorrecto';
            if (typeof showMessage === 'function') {
                showMessage(msg, 'error');
            } else {
                alert(msg);
            }
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('Error:', error);
        if (typeof showMessage === 'function') {
            showMessage('Error de conexión', 'error');
        } else {
            alert('Error de conexión');
        }
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function resendCode() {
    // Lógica para reenviar código
    if (typeof showMessage === 'function') {
        showMessage('Código reenviado (simulado)', 'success');
    } else {
        alert('Código reenviado (simulado)');
    }
}

// ═══════════════════════════════════════════════════════
// DESIGN ENHANCEMENT PATCH — Premium Theme
// Injects assistant label and enhances message rendering
// ═══════════════════════════════════════════════════════

(function patchMessageRendering() {
    // Override addMessage to inject assistant label
    const _origAddMessage = window.addMessage;
    if (typeof _origAddMessage !== 'function') return;

    window.addMessage = function (type, content, skipAnimation = false, referencias = [], messageId = null) {
        _origAddMessage.call(this, type, content, skipAnimation, referencias, messageId);

        // After the message is added, inject label for assistant messages
        if (type === 'assistant') {
            const messages = document.querySelectorAll('#chat .message.assistant');
            const last = messages[messages.length - 1];
            if (last && !last.querySelector('.assistant-label')) {
                const body = last.querySelector('.message-body');
                if (body) {
                    const label = document.createElement('div');
                    label.className = 'assistant-label';
                    label.textContent = 'JP-LegalBot';
                    body.insertBefore(label, body.firstChild);
                }
            }
        }
    };
})();
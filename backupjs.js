// script.js - Sohbet Geçmişi Kaydeden Final Versiyon

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. ELEMENT SEÇİMLERİ ---
    const chatContainer = document.querySelector('.flex.flex-col.gap-4');
    const inputField = document.querySelector('input[type="text"]');
    const buttons = document.querySelectorAll('button');
    const sendButton = Array.from(buttons).find(btn => btn.textContent.trim().includes('arrow_upward'));
    
    // Bakiye Elementleri
    const balanceElements = document.querySelectorAll('.text-3xl.font-bold');
    const cashBalanceEl = balanceElements[1]; 
    const incomeEl = document.getElementById('total-income');
    const expenseEl = document.getElementById('total-expense');

    // !!! API ANAHTARI !!!
    const API_KEY = "AIzaSyAFhoTRsyS1bR7asoGQUQmh95iVXzLt0u0"; 
    
    let cachedModelName = null;
    let deleteConfirmCallback = null;

    // --- 2. BAŞLANGIÇ AYARLARI ---
    injectModalHTML(); 
    loadFromLocalStorage(); 
    loadChatHistory(); // YENİ: Sohbet geçmişini yükle

    // --- 3. MODAL (POP-UP) YAPISI ---
    function injectModalHTML() {
        if (document.getElementById('custom-modal')) return;
        const modalHTML = `
        <div id="custom-modal" class="fixed inset-0 z-[9999] flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-300">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="modal-backdrop"></div>
            <div class="relative w-[90%] max-w-sm transform scale-95 rounded-2xl bg-[#1e1f38] p-6 shadow-2xl border border-white/10 transition-transform duration-300" id="modal-card">
                <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                    <span class="material-symbols-outlined text-2xl">warning</span>
                </div>
                <h3 class="text-xl font-bold text-white mb-2">Emin misiniz?</h3>
                <p class="text-sm text-slate-400 mb-6 leading-relaxed">Bu işlemi silmek üzeresiniz. Bakiye güncellenecektir.</p>
                <div class="flex justify-end gap-3">
                    <button id="modal-cancel" class="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors">Vazgeç</button>
                    <button id="modal-confirm" class="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all transform active:scale-95">Evet, Sil</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        document.getElementById('modal-backdrop').addEventListener('click', closeModal);
        document.getElementById('modal-confirm').addEventListener('click', () => {
            if (deleteConfirmCallback) deleteConfirmCallback();
            closeModal();
        });
    }

    function openModal(onConfirm) {
        const modal = document.getElementById('custom-modal');
        const card = document.getElementById('modal-card');
        deleteConfirmCallback = onConfirm;
        modal.classList.remove('opacity-0', 'pointer-events-none');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }

    function closeModal() {
        const modal = document.getElementById('custom-modal');
        const card = document.getElementById('modal-card');
        modal.classList.add('opacity-0', 'pointer-events-none');
        card.classList.remove('scale-100');
        card.classList.add('scale-95');
        deleteConfirmCallback = null;
    }

    // --- 4. SOHBET GEÇMİŞİ YÖNETİMİ (YENİ) ---
    function loadChatHistory() {
        const history = JSON.parse(localStorage.getItem('chatHistory')) || [];
        // Geçmişten yüklerken 'false' parametresi gönderiyoruz ki tekrar kaydetmesin
        history.forEach(msg => addMessageToUI(msg.sender, msg.text, false));
    }

    function saveMessageToStorage(sender, text) {
        const history = JSON.parse(localStorage.getItem('chatHistory')) || [];
        history.push({ sender, text, timestamp: new Date().toISOString() });
        // Son 50 mesajı tutalım, çok şişmesin
        if (history.length > 50) history.shift();
        localStorage.setItem('chatHistory', JSON.stringify(history));
    }

    // --- 5. VERİ YÖNETİMİ ---
    function loadFromLocalStorage() {
        const savedBalance = localStorage.getItem('totalBalance');
        if (savedBalance && cashBalanceEl) cashBalanceEl.innerText = savedBalance;
        const savedTransactions = JSON.parse(localStorage.getItem('transactions')) || [];
        savedTransactions.forEach(t => addTransactionToUI(t));
        calculateStats(savedTransactions);
    }

    function calculateStats(transactions) {
        let totalIncome = 0;
        let totalExpense = 0;
        transactions.forEach(t => {
            if (t.amount > 0) totalIncome += t.amount;
            else totalExpense += Math.abs(t.amount);
        });
        const formatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
        if (incomeEl) incomeEl.innerText = formatter.format(totalIncome);
        if (expenseEl) expenseEl.innerText = formatter.format(totalExpense);
    }

    function addTransactionToUI(transaction) {
        const transactionList = document.querySelector('.flex.flex-col.gap-3.overflow-y-auto');
        if (!transactionList) return;
        const isExpense = transaction.amount < 0;
        const colorClass = isExpense ? 'text-white' : 'text-green-400';
        const icon = isExpense ? 'shopping_cart' : 'account_balance_wallet';
        const bgClass = isExpense ? 'bg-orange-500/10 text-orange-400' : 'bg-green-500/10 text-green-400';
        
        const html = `
        <div class="group flex items-center justify-between rounded-xl bg-surface-dark/40 border border-white/5 p-3 hover:bg-white/5 transition-all animation-fade-in relative overflow-hidden">
            <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-full ${bgClass}">
                    <span class="material-symbols-outlined text-[20px]">${icon}</span>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="text-sm font-semibold text-white">${transaction.desc}</span>
                    <span class="text-[10px] font-medium text-slate-500 uppercase">${transaction.category}</span>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex flex-col items-end gap-0.5">
                    <span class="text-sm font-bold ${colorClass}">${transaction.amount} TL</span>
                    <span class="text-[10px] text-slate-600">İşlendi</span>
                </div>
                <button class="delete-btn opacity-0 group-hover:opacity-100 transition-all p-2 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-500 z-10" title="Kaydı Sil">
                    <span class="material-symbols-outlined text-lg">delete</span>
                </button>
            </div>
        </div>`;
        
        transactionList.insertAdjacentHTML('afterbegin', html);
        const newRow = transactionList.firstElementChild;
        
        newRow.querySelector('.delete-btn').addEventListener('click', () => {
            openModal(() => {
                let storedTransactions = JSON.parse(localStorage.getItem('transactions')) || [];
                const matchIndex = storedTransactions.findIndex(t => 
                    t.desc === transaction.desc && t.amount === transaction.amount && t.category === transaction.category
                );
                if (matchIndex > -1) {
                    storedTransactions.splice(matchIndex, 1);
                    localStorage.setItem('transactions', JSON.stringify(storedTransactions));
                    if (cashBalanceEl) {
                        let currentBalance = parseFloat(cashBalanceEl.innerText.replace(/[^0-9.-]+/g, ""));
                        let newBalance = currentBalance - transaction.amount;
                        const formattedBalance = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(newBalance);
                        cashBalanceEl.innerText = formattedBalance;
                        localStorage.setItem('totalBalance', formattedBalance);
                    }
                    calculateStats(storedTransactions);
                    newRow.style.opacity = '0';
                    setTimeout(() => newRow.remove(), 300);
                }
            });
        });
    }

    function updateDashboard(transaction) {
        if (cashBalanceEl) {
            let currentBalance = parseFloat(cashBalanceEl.innerText.replace(/[^0-9.-]+/g, ""));
            if (isNaN(currentBalance)) currentBalance = 0;
            let newBalance = currentBalance + transaction.amount;
            const formattedBalance = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(newBalance);
            cashBalanceEl.innerText = formattedBalance;
            cashBalanceEl.classList.add('text-green-400');
            setTimeout(() => cashBalanceEl.classList.remove('text-green-400'), 500);
            localStorage.setItem('totalBalance', formattedBalance);
        }
        addTransactionToUI(transaction);
        const currentTransactions = JSON.parse(localStorage.getItem('transactions')) || [];
        currentTransactions.unshift(transaction);
        localStorage.setItem('transactions', JSON.stringify(currentTransactions));
        calculateStats(currentTransactions);
    }

    // --- 6. MESAJLAŞMA VE API ---
    async function handleSendMessage() {
        if (!inputField) return;
        const message = inputField.value.trim();
        if (!message) return;

        addMessageToUI('user', message, true); // true = kaydet
        inputField.value = ''; 
        inputField.focus();

        try {
            await new Promise(resolve => setTimeout(resolve, 600)); 
            const rawResponse = await fetchAIResponse(message);
            const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            let data;
            try { data = JSON.parse(cleanJson); } 
            catch (e) { data = { reply: rawResponse, transactions: [] }; }

            addMessageToUI('ai', data.reply, true); // true = kaydet

            if (data.transactions && Array.isArray(data.transactions)) {
                data.transactions.forEach(t => setTimeout(() => updateDashboard(t), 300));
            }
        } catch (error) {
            console.error('Hata:', error);
            addMessageToUI('ai', "Bir sorun oluştu.", false);
        }
    }

    async function fetchAIResponse(userMessage) {
        if (!cachedModelName) cachedModelName = await findBestAvailableModel(API_KEY);
        const modelPath = cachedModelName.includes('/') ? cachedModelName : `models/${cachedModelName}`;
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${API_KEY}`;
        
        const prompt = `Sen bir finans asistanısın. Mesaj: "${userMessage}". JSON döndür: { "reply": "Cevap", "transactions": [{"amount": -10, "category": "Gıda", "desc": "Ekmek"}] }`;

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Hata");
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    }

    async function findBestAvailableModel(key) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await response.json();
            if (!data.models) return "gemini-1.5-flash";
            const available = data.models.filter(m => m.supportedGenerationMethods?.includes("generateContent"));
            let best = available.find(m => m.name.includes("flash")) || available.find(m => m.name.includes("pro")) || available[0];
            return best ? best.name : "gemini-1.5-flash";
        } catch (e) { return "gemini-1.5-flash"; }
    }

    if (inputField) inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendMessage(); });
    if (sendButton) sendButton.addEventListener('click', (e) => { e.preventDefault(); handleSendMessage(); });

    // YENİ: shouldSave parametresi eklendi
    function addMessageToUI(sender, text, shouldSave = false) {
        if (!chatContainer) return;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const safeText = text ? text.replace(/</g, "<").replace(/>/g, ">") : "";
        const formattedText = safeText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        // Mesajı Kaydet
        if (shouldSave) saveMessageToStorage(sender, text);

        let htmlContent = '';
        if (sender === 'user') {
            htmlContent = `
            <div class="flex flex-row-reverse items-start gap-4 max-w-[80%] self-end mb-4 animation-fade-in">
                <div class="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10" style='background-image: url("https://lh3.googleusercontent.com/aida-public/AB6AXuDZoEyx9yEtrs9l4e0lT87g98MXxASbQLBl9JVulqV2FhYMwtKPiZv9fb5S7BfsBN7WGlrTEotzpI7Xj0peGzOFUICXZtqjdVGS3-IB9d3n-IfMWXRwYhWeoa5o1r2BR-DuckAx_-mpCfEc9_xmWJq8h08JZR-kLF_ZFdgvFRlAJawV5isTKNujWMHVx2Izqu5GzcjiDuHLr9O0i0G48KihqSCfiJLSsT7alsiKSA8A_KcaNCKOyepApOzflM5urEeLioxj89vvu46W"); background-size: cover;'></div>
                <div class="flex flex-col gap-1 items-end">
                    <span class="text-xs font-medium text-slate-400">Siz • ${time}</span>
                    <div class="rounded-2xl rounded-tr-none bg-primary px-5 py-3 text-white shadow-md"><p class="leading-relaxed">${formattedText}</p></div>
                </div>
            </div>`;
        } else {
            htmlContent = `
            <div class="flex items-start gap-4 max-w-[80%] mb-4 animation-fade-in">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/30"><span class="material-symbols-outlined text-xl">smart_toy</span></div>
                <div class="flex flex-col gap-1">
                    <span class="text-xs font-medium text-slate-400">Finans AI • ${time}</span>
                    <div class="rounded-2xl rounded-tl-none bg-surface-metallic border border-white/5 px-5 py-3 text-slate-200 shadow-md"><p class="leading-relaxed">${formattedText}</p></div>
                </div>
            </div>`;
        }
        chatContainer.insertAdjacentHTML('beforeend', htmlContent);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});
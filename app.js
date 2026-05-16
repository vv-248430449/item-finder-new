// ===== 数据库初始化 =====
const db = new Dexie('ItemFinderDB');
db.version(2).stores({
    items: '++id, name, location, category, is_pinned, search_count, last_viewed, created_at',
    loans: '++id, item_id, lent_to, lent_date, expected_return, returned',
    reminders: '++id, item_id, reminder_type, reminder_date, note',
    photos: 'key, base64'
});

// ===== 全局状态 =====
let currentView = 'all';
let searchText = '';
let selectedCategory = '全部';
let photoCache = {}; // 内存中的照片缓存 base64

// ===== DOM 加载完成后初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();

    // 从 IndexedDB 加载照片缓存
    const allPhotos = await db.photos.toArray();
    allPhotos.forEach(p => photoCache[p.key] = p.base64);

    await loadItems();

    // 注册 Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

// ===== 事件监听 =====
function setupEventListeners() {
    // 搜索
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchText = e.target.value.trim();
        loadItems();
    });

    // 新增按钮
    document.getElementById('btnAdd').addEventListener('click', () => {
        openAddModal();
    });

    // 分类筛选
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
        selectedCategory = e.target.value;
        loadItems();
    });

    // 视图切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            loadItems();
        });
    });

    // 照片预览
    document.getElementById('itemPhoto').addEventListener('change', previewPhoto);
}

// ===== 加载物品列表 =====
async function loadItems() {
    const contentArea = document.getElementById('contentArea');
    const statusBar = document.getElementById('statusBar');

    contentArea.innerHTML = '';

    if (currentView === 'stats') {
        await showStats(contentArea, statusBar);
        return;
    }
    if (currentView === 'loaned') {
        await showLoaned(contentArea, statusBar);
        return;
    }
    if (currentView === 'reminders') {
        await showReminders(contentArea, statusBar);
        return;
    }

    // 构建查询
    let items = [];
    if (currentView === 'pinned') {
        items = await db.items.where('is_pinned').equals(1).toArray();
    } else if (currentView === 'recent') {
        items = await db.items.where('last_viewed').notEqual(undefined).reverse().sortBy('last_viewed');
        items = items.slice(0, 20);
    } else {
        items = await db.items.toArray();
    }

    // 搜索过滤
    if (searchText) {
        const lower = searchText.toLowerCase();
        items = items.filter(i =>
            (i.name && i.name.toLowerCase().includes(lower)) ||
            (i.location && i.location.toLowerCase().includes(lower)) ||
            (i.description && i.description.toLowerCase().includes(lower))
        );
    }

    // 分类过滤
    if (selectedCategory !== '全部') {
        items = items.filter(i => i.category === selectedCategory);
    }

    // 排序
    if (currentView !== 'recent') {
        items.sort((a, b) => {
            if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned;
            if (b.search_count !== a.search_count) return b.search_count - a.search_count;
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    statusBar.textContent = `共 ${items.length} 个物品`;

    if (items.length === 0) {
        contentArea.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>暂无物品，点击右上角添加吧！</p>
            </div>
        `;
        return;
    }

    for (const item of items) {
        contentArea.appendChild(createItemCard(item));
    }
}

// ===== 创建物品卡片 =====
function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'item-card';

    const hasPhoto = item.photo_path && photoCache[item.photo_path];
    const photoHtml = hasPhoto
        ? `<img src="${photoCache[item.photo_path]}" alt="照片" onclick="showPhotoDetail('${item.photo_path}', '${escapeHtml(item.name)}')">`
        : `📷`;

    const pinIcon = item.is_pinned ? '⭐ ' : '';
    const descHtml = item.description ? `<div class="item-desc">📝 ${escapeHtml(item.description)}</div>` : '';

    let statsText = `🔍 查找 ${item.search_count || 0} 次`;
    let statsClass = 'item-stats';
    if ((item.search_count || 0) >= 5) {
        statsText += ' ⚠️ 经常找不到！';
        statsClass += ' warning';
    }
    if (item.last_viewed) {
        statsText += ` | 最近：${formatDate(item.last_viewed)}`;
    }

    card.innerHTML = `
        <div class="item-photo">${photoHtml}</div>
        <div class="item-info">
            <div class="item-title-row">
                <div class="item-name">${pinIcon}${escapeHtml(item.name)}</div>
                <div class="item-category">🏷 ${item.category || '其他'}</div>
            </div>
            <div class="item-location">📍 ${escapeHtml(item.location)}</div>
            ${descHtml}
            <div class="${statsClass}">${statsText}</div>
            <div class="card-actions">
                <button class="btn-pin" onclick="togglePin(${item.id})">${item.is_pinned ? '取消置顶' : '置顶'}</button>
                <button class="btn-view" onclick="viewItem(${item.id})">查看</button>
                <button class="btn-edit" onclick="editItem(${item.id})">编辑</button>
                <button class="btn-loan" onclick="openLoanModal(${item.id})">借出</button>
                <button class="btn-remind" onclick="openReminderModal(${item.id})">提醒</button>
                <button class="btn-delete" onclick="deleteItem(${item.id})">删除</button>
            </div>
        </div>
    `;

    return card;
}

// ===== 置顶切换 =====
async function togglePin(id) {
    const item = await db.items.get(id);
    if (item) {
        await db.items.update(id, { is_pinned: item.is_pinned ? 0 : 1 });
        await loadItems();
    }
}

// ===== 查看物品 =====
async function viewItem(id) {
    await db.items.update(id, {
        search_count: (await db.items.get(id)).search_count + 1,
        last_viewed: new Date().toISOString()
    });
    await showItemDetail(id);
}

// ===== 显示物品详情 =====
async function showItemDetail(id) {
    const item = await db.items.get(id);
    if (!item) return;

    document.getElementById('detailTitle').textContent = item.name;

    const hasPhoto = item.photo_path && photoCache[item.photo_path];
    const photoHtml = hasPhoto
        ? `<img src="${photoCache[item.photo_path]}" class="detail-photo" onclick="showPhotoDetail('${item.photo_path}', '${escapeHtml(item.name)}')">`
        : '';

    let html = photoHtml;
    html += `
        <div class="detail-row"><span class="detail-icon">📍</span><span class="detail-label">位置</span><span class="detail-value">${escapeHtml(item.location)}</span></div>
        <div class="detail-row"><span class="detail-icon">🏷</span><span class="detail-label">分类</span><span class="detail-value">${item.category || '其他'}</span></div>
    `;
    if (item.description) {
        html += `<div class="detail-row"><span class="detail-icon">📝</span><span class="detail-label">描述</span><span class="detail-value">${escapeHtml(item.description)}</span></div>`;
    }
    html += `<div class="detail-row"><span class="detail-icon">🔍</span><span class="detail-label">查找次数</span><span class="detail-value">${item.search_count || 0} 次</span></div>`;
    html += `<div class="detail-row"><span class="detail-icon">📅</span><span class="detail-label">创建时间</span><span class="detail-value">${formatDateTime(item.created_at)}</span></div>`;

    document.getElementById('detailBody').innerHTML = html;
    document.getElementById('detailFooter').innerHTML = `
        <button class="btn-secondary" onclick="closeDetailModal()">关闭</button>
        <button class="btn-primary" onclick="closeDetailModal(); editItem(${item.id});">编辑</button>
    `;

    document.getElementById('detailModal').classList.add('active');
}

// ===== 照片大图 =====
function showPhotoDetail(photoPath, itemName) {
    if (!photoPath || !photoCache[photoPath]) {
        alert('暂无照片');
        return;
    }
    document.getElementById('photoLarge').src = photoCache[photoPath];
    document.getElementById('photoInfo').textContent = itemName;
    document.getElementById('photoModal').classList.add('active');
}

function closePhotoModal() {
    document.getElementById('photoModal').classList.remove('active');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
}

// ===== 新增/编辑弹窗 =====
function openAddModal() {
    document.getElementById('modalTitle').textContent = '新增物品';
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemLocation').value = '';
    document.getElementById('itemCategory').value = '其他';
    document.getElementById('itemDesc').value = '';
    document.getElementById('itemPhoto').value = '';
    document.getElementById('photoPreview').innerHTML = '';
    document.getElementById('itemModal').classList.add('active');
}

async function editItem(id) {
    const item = await db.items.get(id);
    if (!item) return;

    document.getElementById('modalTitle').textContent = '编辑物品';
    document.getElementById('itemId').value = id;
    document.getElementById('itemName').value = item.name || '';
    document.getElementById('itemLocation').value = item.location || '';
    document.getElementById('itemCategory').value = item.category || '其他';
    document.getElementById('itemDesc').value = item.description || '';
    document.getElementById('itemPhoto').value = '';

    // 显示当前照片预览
    const preview = document.getElementById('photoPreview');
    if (item.photo_path && photoCache[item.photo_path]) {
        preview.innerHTML = `
            <img src="${photoCache[item.photo_path]}" style="max-width:100%;max-height:150px;border-radius:8px;">
            <p style="font-size:12px;color:#999;margin-top:4px;">当前照片（选择新照片将替换）</p>
        `;
    } else {
        preview.innerHTML = '<p style="font-size:12px;color:#999;">暂无照片</p>';
    }

    document.getElementById('itemModal').classList.add('active');
}

function closeModal() {
    document.getElementById('itemModal').classList.remove('active');
}

// ===== 照片预览 =====
function previewPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        document.getElementById('photoPreview').innerHTML =
            `<img src="${ev.target.result}" style="max-width:100%;max-height:150px;border-radius:8px;">`;
    };
    reader.readAsDataURL(file);
}

// ===== 保存物品 =====
async function saveItem() {
    const id = document.getElementById('itemId').value;
    const name = document.getElementById('itemName').value.trim();
    const location = document.getElementById('itemLocation').value.trim();
    const category = document.getElementById('itemCategory').value;
    const description = document.getElementById('itemDesc').value.trim();
    const photoFile = document.getElementById('itemPhoto').files[0];

    if (!name || !location) {
        alert('名称和位置不能为空！');
        return;
    }

    let photo_path = null;

    if (id) {
        // 编辑模式：先获取旧照片路径
        const oldItem = await db.items.get(parseInt(id));
        photo_path = oldItem ? oldItem.photo_path : null;
    }

    // 处理新照片
    if (photoFile) {
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(photoFile);
        });
        photo_path = 'photo_' + Date.now();
        photoCache[photo_path] = base64;
        // 持久化到 IndexedDB
        await db.photos.put({ key: photo_path, base64: base64 });

        // 如果有旧照片，清理缓存和数据库
        if (id && oldItem && oldItem.photo_path) {
            delete photoCache[oldItem.photo_path];
            await db.photos.delete(oldItem.photo_path);
        }
    }

    if (id) {
        await db.items.update(parseInt(id), {
            name, location, category, description, photo_path
        });
    } else {
        await db.items.add({
            name, location, category, description, photo_path,
            is_pinned: 0,
            search_count: 0,
            created_at: new Date().toISOString()
        });
    }

    closeModal();
    await loadItems();
}

// ===== 删除物品 =====
async function deleteItem(id) {
    if (!confirm('确定要删除这个物品吗？')) return;

    const item = await db.items.get(id);
    if (item && item.photo_path) {
        delete photoCache[item.photo_path];
        await db.photos.delete(item.photo_path);
    }

    await db.items.delete(id);
    await db.loans.where('item_id').equals(id).delete();
    await db.reminders.where('item_id').equals(id).delete();
    await loadItems();
}

// ===== 统计视图 =====
async function showStats(container, statusBar) {
    const items = await db.items.toArray();
    const total = items.length;
    const pinned = items.filter(i => i.is_pinned).length;
    const totalSearches = items.reduce((sum, i) => sum + (i.search_count || 0), 0);

    // 分类统计
    const catMap = {};
    items.forEach(i => {
        catMap[i.category || '其他'] = (catMap[i.category || '其他'] || 0) + 1;
    });
    let catHtml = '';
    for (const [cat, count] of Object.entries(catMap).sort((a, b) => b[1] - a[1])) {
        catHtml += `<div class="stat-item"><span class="stat-label">${cat}</span><span class="stat-value">${count} 个</span></div>`;
    }

    // 高频查找
    const hotItems = items.filter(i => (i.search_count || 0) > 0).sort((a, b) => b.search_count - a.search_count).slice(0, 10);
    let hotHtml = '';
    for (const item of hotItems) {
        const cls = (item.search_count || 0) >= 5 ? 'hot-item' : '';
        hotHtml += `<div class="stat-item"><span class="stat-label ${cls}">${item.name}</span><span class="stat-value ${cls}">${item.search_count} 次</span></div>`;
    }

    container.innerHTML = `
        <div class="stats-card">
            <h3>📊 总体统计</h3>
            <div class="stat-item"><span class="stat-label">总物品数</span><span class="stat-value">${total}</span></div>
            <div class="stat-item"><span class="stat-label">置顶物品</span><span class="stat-value">${pinned}</span></div>
            <div class="stat-item"><span class="stat-label">总查找次数</span><span class="stat-value">${totalSearches}</span></div>
        </div>
        <div class="stats-card">
            <h3>📂 分类分布</h3>
            ${catHtml || '<p style="color:#999;">暂无数据</p>'}
        </div>
        <div class="stats-card">
            <h3>🏆 查找次数排行</h3>
            ${hotHtml || '<p style="color:#999;">暂无数据</p>'}
        </div>
    `;
    statusBar.textContent = '统计视图';
}

// ===== 借出视图 =====
async function showLoaned(container, statusBar) {
    const loans = await db.loans.where('returned').equals(0).reverse().sortBy('lent_date');
    const items = await db.items.toArray();
    const itemMap = {};
    items.forEach(i => itemMap[i.id] = i);

    statusBar.textContent = `借出中：${loans.length} 件`;

    if (loans.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📤</div>
                <p>没有借出中的物品</p>
            </div>
        `;
        return;
    }

    for (const loan of loans) {
        const item = itemMap[loan.item_id];
        const div = document.createElement('div');
        div.className = 'sub-card';
        div.innerHTML = `
            <h4>📤 ${item ? escapeHtml(item.name) : '未知物品'}</h4>
            <p>借给：${escapeHtml(loan.lent_to)}</p>
            <p>借出时间：${formatDate(loan.lent_date)}</p>
            ${loan.expected_return ? `<p class="sub-date">预计归还：${loan.expected_return}</p>` : ''}
            <button class="btn-primary" style="margin-top:10px;" onclick="markReturned(${loan.id})">标记已归还</button>
        `;
        container.appendChild(div);
    }
}

// ===== 提醒视图 =====
async function showReminders(container, statusBar) {
    const reminders = await db.reminders.toArray();
    const items = await db.items.toArray();
    const itemMap = {};
    items.forEach(i => itemMap[i.id] = i);

    // 过滤过期提醒
    const today = new Date().toISOString().split('T')[0];
    const activeReminders = reminders.filter(r => !r.reminder_date || r.reminder_date >= today);

    statusBar.textContent = `提醒数：${activeReminders.length}`;

    if (activeReminders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⏰</div>
                <p>暂无提醒</p>
            </div>
        `;
        return;
    }

    for (const rem of activeReminders) {
        const item = itemMap[rem.item_id];
        const div = document.createElement('div');
        div.className = 'sub-card';
        div.innerHTML = `
            <h4>⏰ ${item ? escapeHtml(item.name) : '未知物品'}</h4>
            <p>类型：${rem.reminder_type}</p>
            ${rem.reminder_date ? `<p class="sub-date">日期：${rem.reminder_date}</p>` : ''}
            ${rem.note ? `<p>备注：${escapeHtml(rem.note)}</p>` : ''}
            <button class="btn-delete" style="margin-top:10px;padding:6px 14px;" onclick="deleteReminder(${rem.id})">删除提醒</button>
        `;
        container.appendChild(div);
    }
}

// ===== 借出弹窗 =====
function openLoanModal(itemId) {
    document.getElementById('loanItemId').value = itemId;
    document.getElementById('loanTo').value = '';
    document.getElementById('loanReturnDate').value = '';
    document.getElementById('loanModal').classList.add('active');
}

function closeLoanModal() {
    document.getElementById('loanModal').classList.remove('active');
}

async function saveLoan() {
    const itemId = parseInt(document.getElementById('loanItemId').value);
    const lentTo = document.getElementById('loanTo').value.trim();
    const returnDate = document.getElementById('loanReturnDate').value;

    if (!lentTo) {
        alert('借给谁不能为空！');
        return;
    }

    await db.loans.add({
        item_id: itemId,
        lent_to: lentTo,
        lent_date: new Date().toISOString(),
        expected_return: returnDate || null,
        returned: 0
    });

    closeLoanModal();
    await loadItems();
}

async function markReturned(loanId) {
    await db.loans.update(loanId, { returned: 1 });
    await loadItems();
}

// ===== 提醒弹窗 =====
function openReminderModal(itemId) {
    document.getElementById('reminderItemId').value = itemId;
    document.getElementById('reminderType').value = '过期提醒';
    document.getElementById('reminderDate').value = '';
    document.getElementById('reminderNote').value = '';
    document.getElementById('reminderModal').classList.add('active');
}

function closeReminderModal() {
    document.getElementById('reminderModal').classList.remove('active');
}

async function saveReminder() {
    const itemId = parseInt(document.getElementById('reminderItemId').value);
    const type = document.getElementById('reminderType').value;
    const date = document.getElementById('reminderDate').value;
    const note = document.getElementById('reminderNote').value.trim();

    await db.reminders.add({
        item_id: itemId,
        reminder_type: type,
        reminder_date: date || null,
        note: note
    });

    closeReminderModal();
    await loadItems();
}

async function deleteReminder(id) {
    await db.reminders.delete(id);
    await loadItems();
}

// ===== 工具函数 =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(iso) {
    if (!iso) return '';
    return iso.split('T')[0];
}

function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

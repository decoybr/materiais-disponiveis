const API = '';
let adminToken = localStorage.getItem('adminToken') || null;
let currentItems = [];
let pendingRemovePhoto = false;

// ========== UTILS ==========
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});

function photoUrl(photo) {
  if (!photo) return null;
  return `/uploads/${photo}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Lightbox
function openLightbox(src) {
  if (!src) return;
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightboxImg').src = '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target.id === 'lightbox' || e.target.id === 'lightboxClose') closeLightbox();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ========== CATALOG ==========
async function loadCatalog() {
  try {
    const res = await fetch(`${API}/api/items`);
    const items = await res.json();
    currentItems = items;
    renderCatalog(items);
  } catch (err) {
    showToast('Erro ao carregar catálogo', true);
  }
}

function renderCatalog(items) {
  const grid = document.getElementById('itemsGrid');
  const empty = document.getElementById('emptyCatalog');
  grid.innerHTML = '';
  if (!items.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    const src = photoUrl(item.photo);
    const qtyClass = item.quantity <= 2 ? 'low' : '';

    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = item.name;
      img.loading = 'lazy';
      img.addEventListener('click', e => { e.stopPropagation(); openLightbox(src); });
      card.appendChild(img);
    } else {
      const no = document.createElement('div');
      no.className = 'no-photo';
      no.textContent = '📦';
      card.appendChild(no);
    }

    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<h3>${escapeHtml(item.name)}</h3><span class="item-qty ${qtyClass}">Disponível: ${item.quantity}</span>`;
    card.appendChild(info);
    card.addEventListener('click', () => openRequestModal(item));
    grid.appendChild(card);
  });
}

function openRequestModal(item) {
  document.getElementById('reqItemId').value = item.id;
  document.getElementById('reqQty').value = 1;
  document.getElementById('reqQty').max = item.quantity;
  document.getElementById('reqMaxHint').textContent = `Máximo disponível: ${item.quantity}`;
  document.getElementById('reqNip').value = '';
  document.getElementById('reqNome').value = '';
  document.getElementById('reqSetor').value = '';

  const preview = document.getElementById('requestItemPreview');
  preview.innerHTML = '';
  const src = photoUrl(item.photo);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => openLightbox(src));
    preview.appendChild(img);
  } else {
    const no = document.createElement('div');
    no.className = 'no-photo';
    no.textContent = '📦';
    preview.appendChild(no);
  }
  const text = document.createElement('div');
  text.innerHTML = `<strong>${escapeHtml(item.name)}</strong><br><small>Disponível: ${item.quantity}</small>`;
  preview.appendChild(text);
  openModal('requestModal');
}

document.getElementById('requestForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    item_id: document.getElementById('reqItemId').value,
    quantity: document.getElementById('reqQty').value,
    nip: document.getElementById('reqNip').value.trim(),
    nome: document.getElementById('reqNome').value.trim(),
    setor: document.getElementById('reqSetor').value.trim()
  };
  try {
    const res = await fetch(`${API}/api/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na solicitação');
    showToast(data.message);
    closeModal('requestModal');
    loadCatalog();
  } catch (err) {
    showToast(err.message, true);
  }
});

// ========== ADMIN ==========
function updateAdminUI() {
  const isAdmin = !!adminToken;
  document.getElementById('catalogView').classList.toggle('hidden', isAdmin);
  document.getElementById('adminView').classList.toggle('hidden', !isAdmin);
  document.getElementById('btnAdmin').classList.toggle('hidden', isAdmin);
  document.getElementById('adminBadge').classList.toggle('hidden', !isAdmin);
  if (isAdmin) {
    loadAdminItems();
    loadRequests();
  }
}

document.getElementById('btnAdmin').addEventListener('click', () => {
  if (adminToken) updateAdminUI();
  else openModal('loginModal');
});

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;
  try {
    const res = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no login');
    adminToken = data.token;
    localStorage.setItem('adminToken', adminToken);
    closeModal('loginModal');
    document.getElementById('loginPass').value = '';
    showToast('Login realizado com sucesso');
    updateAdminUI();
  } catch (err) {
    showToast(err.message, true);
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  try {
    await fetch(`${API}/api/admin/logout`, {
      method: 'POST',
      headers: { 'x-admin-token': adminToken }
    });
  } catch {}
  adminToken = null;
  localStorage.removeItem('adminToken');
  showToast('Logout realizado');
  updateAdminUI();
  loadCatalog();
});

// Tabs
document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'tabRequests') loadRequests();
    if (btn.dataset.tab === 'tabItems') loadAdminItems();
  });
});

// Admin items
async function loadAdminItems() {
  try {
    const res = await fetch(`${API}/api/items/all`);
    const items = await res.json();
    const tbody = document.querySelector('#adminItemsTable tbody');
    tbody.innerHTML = '';
    items.forEach(item => {
      const tr = document.createElement('tr');
      const src = photoUrl(item.photo);

      const tdPhoto = document.createElement('td');
      if (src) {
        const img = document.createElement('img');
        img.className = 'table-photo';
        img.src = src;
        img.addEventListener('click', () => openLightbox(src));
        tdPhoto.appendChild(img);
      } else {
        const no = document.createElement('div');
        no.className = 'table-no-photo';
        no.textContent = '📦';
        tdPhoto.appendChild(no);
      }
      tr.appendChild(tdPhoto);

      const tdName = document.createElement('td');
      tdName.textContent = item.name;
      tr.appendChild(tdName);

      const tdQty = document.createElement('td');
      tdQty.innerHTML = `<strong>${item.quantity}</strong>`;
      tr.appendChild(tdQty);

      const tdActions = document.createElement('td');
      tdActions.className = 'actions';
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm btn-outline';
      btnEdit.textContent = 'Editar';
      btnEdit.onclick = () => editItem(item);
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-sm btn-danger';
      btnDel.textContent = 'Excluir';
      btnDel.onclick = () => deleteItem(item.id, item.name);
      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast('Erro ao carregar itens', true);
  }
}

function updatePhotoPreview(src) {
  const preview = document.getElementById('photoPreview');
  const actions = document.getElementById('photoActions');
  preview.innerHTML = '';
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.addEventListener('click', () => openLightbox(src));
    preview.appendChild(img);
    actions.style.display = 'flex';
  } else {
    actions.style.display = 'none';
  }
}

document.getElementById('btnAddItem').addEventListener('click', () => {
  document.getElementById('itemModalTitle').textContent = 'Novo Item';
  document.getElementById('editItemId').value = '';
  document.getElementById('itemName').value = '';
  document.getElementById('itemQty').value = '0';
  document.getElementById('itemPhoto').value = '';
  pendingRemovePhoto = false;
  updatePhotoPreview(null);
  openModal('itemModal');
});

window.editItem = function(item) {
  document.getElementById('itemModalTitle').textContent = 'Editar Item';
  document.getElementById('editItemId').value = item.id;
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemQty').value = item.quantity;
  document.getElementById('itemPhoto').value = '';
  pendingRemovePhoto = false;
  updatePhotoPreview(photoUrl(item.photo));
  openModal('itemModal');
};

window.deleteItem = async function(id, name) {
  if (!confirm(`Excluir o item "${name}"?`)) return;
  try {
    const res = await fetch(`${API}/api/admin/items/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': adminToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Item excluído');
    loadAdminItems();
  } catch (err) {
    showToast(err.message, true);
  }
};

document.getElementById('itemPhoto').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) {
    pendingRemovePhoto = false;
    const url = URL.createObjectURL(file);
    updatePhotoPreview(url);
  }
});

document.getElementById('btnRemovePhoto').addEventListener('click', () => {
  pendingRemovePhoto = true;
  document.getElementById('itemPhoto').value = '';
  updatePhotoPreview(null);
  showToast('Foto será removida ao salvar');
});

document.getElementById('itemForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('editItemId').value;
  const formData = new FormData();
  formData.append('name', document.getElementById('itemName').value);
  formData.append('quantity', document.getElementById('itemQty').value);
  if (pendingRemovePhoto) formData.append('remove_photo', '1');
  const photo = document.getElementById('itemPhoto').files[0];
  if (photo) formData.append('photo', photo);

  const url = id ? `${API}/api/admin/items/${id}` : `${API}/api/admin/items`;
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'x-admin-token': adminToken },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
    showToast(id ? 'Item atualizado' : 'Item criado');
    closeModal('itemModal');
    pendingRemovePhoto = false;
    loadAdminItems();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Requests
async function loadRequests() {
  try {
    const res = await fetch(`${API}/api/admin/requests`, {
      headers: { 'x-admin-token': adminToken }
    });
    if (!res.ok) throw new Error('Não autorizado');
    const requests = await res.json();
    const tbody = document.querySelector('#requestsTable tbody');
    tbody.innerHTML = '';
    if (!requests.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nenhuma solicitação ainda</td></tr>';
      return;
    }
    requests.forEach(r => {
      const tr = document.createElement('tr');
      const date = new Date(r.created_at).toLocaleString('pt-BR');
      tr.innerHTML = `
        <td>${date}</td>
        <td>${escapeHtml(r.item_name)}</td>
        <td>${r.quantity}</td>
        <td>${escapeHtml(r.nip)}</td>
        <td>${escapeHtml(r.nome)}</td>
        <td>${escapeHtml(r.setor)}</td>
        <td class="actions">
          <button class="btn btn-sm btn-danger" onclick="deleteRequest('${r.id}')">Excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast('Erro ao carregar solicitações', true);
  }
}

window.deleteRequest = async function(id) {
  if (!confirm('Excluir esta solicitação do histórico?')) return;
  try {
    const res = await fetch(`${API}/api/admin/requests/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': adminToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Solicitação excluída');
    loadRequests();
  } catch (err) {
    showToast(err.message, true);
  }
};

// Change password
document.getElementById('changePassForm').addEventListener('submit', async e => {
  e.preventDefault();
  const master = document.getElementById('masterPass').value;
  const newPass = document.getElementById('newPass').value;
  const confirm = document.getElementById('newPassConfirm').value;
  if (newPass !== confirm) {
    showToast('As senhas não coincidem', true);
    return;
  }
  try {
    const res = await fetch(`${API}/api/admin/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken
      },
      body: JSON.stringify({ master_password: master, new_password: newPass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(data.message);
    document.getElementById('changePassForm').reset();
  } catch (err) {
    showToast(err.message, true);
  }
});

// Init
if (adminToken) {
  fetch(`${API}/api/admin/requests`, { headers: { 'x-admin-token': adminToken } })
    .then(r => {
      if (!r.ok) {
        adminToken = null;
        localStorage.removeItem('adminToken');
      }
      updateAdminUI();
      if (!adminToken) loadCatalog();
    })
    .catch(() => {
      adminToken = null;
      localStorage.removeItem('adminToken');
      updateAdminUI();
      loadCatalog();
    });
} else {
  loadCatalog();
}

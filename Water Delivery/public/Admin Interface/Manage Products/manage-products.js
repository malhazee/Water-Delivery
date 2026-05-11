let db = null;
let currentProducts = [];
let currentCategories = [];
let editingProductId = null;
let productsUnsubscribe = null;
let categoriesUnsubscribe = null;

const productsCollectionName = 'products';
const categoriesCollectionName = 'categories';

function initializeFirebase() {
    if (!window.firebase || !firebase.apps || firebase.apps.length === 0 || !firebase.firestore) {
        setFirebaseStatus('Firestore is not loaded. Open this page through Firebase Hosting or the Firebase emulator.', 'error');
        return;
    }

    db = firebase.firestore();
    startCategoriesRealtimeListener();
    startProductsRealtimeListener();
}

function startCategoriesRealtimeListener() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    try {
        if (categoriesUnsubscribe) {
            categoriesUnsubscribe();
        }

        categoriesUnsubscribe = db.collection(categoriesCollectionName).orderBy('sortOrder', 'asc').onSnapshot((snapshot) => {
            currentCategories = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderCategorySelect();
            renderProducts(currentProducts);
        }, (error) => {
            console.error('Error listening to categories:', error);
            setFirebaseStatus('Could not load categories: ' + error.message, 'error');
        });
    } catch (error) {
        console.error('Error starting category listener:', error);
        setFirebaseStatus('Could not start category updates: ' + error.message, 'error');
    }
}

function startProductsRealtimeListener() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const loadBtn = document.getElementById('loadProductsBtn');
    loadBtn.disabled = true;
    setFirebaseStatus('Listening for Firestore product updates...');

    try {
        if (productsUnsubscribe) {
            productsUnsubscribe();
        }

        productsUnsubscribe = db.collection(productsCollectionName).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            currentProducts = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderProducts(currentProducts);
            setFirebaseStatus('Products are live from Firestore.', 'success');
            loadBtn.disabled = false;
        }, (error) => {
            console.error('Error listening to products:', error);
            setFirebaseStatus('Could not listen to Firestore products: ' + error.message, 'error');
            loadBtn.disabled = false;
        });
    } catch (error) {
        console.error('Error starting product listener:', error);
        setFirebaseStatus('Could not start product updates: ' + error.message, 'error');
        loadBtn.disabled = false;
    }
}

function renderCategorySelect() {
    const select = document.getElementById('categorySelect');
    const selectedValue = select.value;
    const activeCategories = currentCategories.filter((category) => category.active !== false);

    if (activeCategories.length === 0) {
        select.innerHTML = '<option value="">Create an active category first</option>';
        return;
    }

    select.innerHTML = '<option value="">Choose category</option>' + activeCategories.map((category) => {
        return `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || 'Unnamed category')}</option>`;
    }).join('');

    if (activeCategories.some((category) => category.id === selectedValue)) {
        select.value = selectedValue;
    }
}

function getProductFormData() {
    const categoryId = document.getElementById('categorySelect').value;
    const category = currentCategories.find((item) => item.id === categoryId);

    return {
        name: document.getElementById('productName').value.trim(),
        categoryId,
        categoryName: category ? category.name || 'Unnamed category' : '',
        price: Number(document.getElementById('price').value),
        unit: document.getElementById('unit').value.trim(),
        imageUrl: document.getElementById('imageUrl').value.trim(),
        description: document.getElementById('productDescription').value.trim(),
        active: document.getElementById('productActive').checked
    };
}

function validateProductData(product) {
    if (!product.name) {
        return 'Please enter the product name.';
    }

    if (!product.categoryId) {
        return 'Please choose a category.';
    }

    if (!Number.isFinite(product.price) || product.price < 0) {
        return 'Price must be 0 or higher.';
    }

    if (!product.unit) {
        return 'Please enter the product unit.';
    }

    return '';
}

async function saveProductToFirestore() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const product = getProductFormData();
    const validationMessage = validateProductData(product);
    if (validationMessage) {
        setFirebaseStatus(validationMessage, 'error');
        return;
    }

    const saveBtn = document.getElementById('saveProductBtn');
    saveBtn.disabled = true;
    setFirebaseStatus('Saving product to Firestore...');

    try {
        if (editingProductId) {
            await db.collection(productsCollectionName).doc(editingProductId).update({
                ...product,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Product updated in Firestore.', 'success');
        } else {
            await db.collection(productsCollectionName).add({
                ...product,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Product saved to Firestore.', 'success');
        }

        clearProductForm();
    } catch (error) {
        console.error('Error saving product:', error);
        setFirebaseStatus('Could not save product: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

function renderProducts(products) {
    const tableBody = document.getElementById('productsTableBody');

    if (products.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6">No products saved yet.</td></tr>';
        return;
    }

    tableBody.innerHTML = products.map((product) => {
        const statusClass = product.active === false ? 'status-inactive' : 'status-active';
        const statusText = product.active === false ? 'Inactive' : 'Active';

        return `
            <tr>
                <td>${escapeHtml(product.name || '')}</td>
                <td>${escapeHtml(resolveCategoryName(product))}</td>
                <td>${escapeHtml(formatPrice(product.price))}</td>
                <td>${escapeHtml(product.unit || '')}</td>
                <td><span class="status-pill ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="btn btn-small btn-edit" data-action="edit" data-id="${escapeHtml(product.id)}">Edit</button>
                        <button type="button" class="btn btn-small btn-delete" data-action="delete" data-id="${escapeHtml(product.id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function startEditProduct(productId) {
    const product = currentProducts.find((item) => item.id === productId);

    if (!product) {
        setFirebaseStatus('Could not find product to edit.', 'error');
        return;
    }

    document.getElementById('productName').value = product.name || '';
    document.getElementById('categorySelect').value = product.categoryId || '';
    document.getElementById('price').value = Number(product.price) || 0;
    document.getElementById('unit').value = product.unit || '';
    document.getElementById('imageUrl').value = product.imageUrl || '';
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productActive').checked = product.active !== false;
    editingProductId = productId;

    document.getElementById('saveProductBtn').textContent = 'Update Product';
    document.getElementById('cancelEditBtn').hidden = false;
    setFirebaseStatus('Editing product. Update fields and save.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(productId) {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const product = currentProducts.find((item) => item.id === productId);
    const productName = product && product.name ? product.name : 'this product';

    if (!confirm('Delete ' + productName + '?')) {
        return;
    }

    setFirebaseStatus('Deleting product...');

    try {
        await db.collection(productsCollectionName).doc(productId).delete();
        if (editingProductId === productId) {
            clearProductForm();
        }
        setFirebaseStatus('Product deleted.', 'success');
    } catch (error) {
        console.error('Error deleting product:', error);
        setFirebaseStatus('Could not delete product: ' + error.message, 'error');
    }
}

function clearProductForm() {
    document.getElementById('productName').value = '';
    document.getElementById('categorySelect').value = '';
    document.getElementById('price').value = 0;
    document.getElementById('unit').value = '';
    document.getElementById('imageUrl').value = '';
    document.getElementById('productDescription').value = '';
    document.getElementById('productActive').checked = true;
    editingProductId = null;
    document.getElementById('saveProductBtn').textContent = 'Save Product to Firestore';
    document.getElementById('cancelEditBtn').hidden = true;
}

function resolveCategoryName(product) {
    const category = currentCategories.find((item) => item.id === product.categoryId);
    return category ? category.name || 'Unnamed category' : product.categoryName || 'Unknown category';
}

function formatPrice(price) {
    const value = Number(price);
    if (!Number.isFinite(value)) {
        return '';
    }

    return value.toFixed(2);
}

function setFirebaseStatus(message, type = '') {
    const statusEl = document.getElementById('firebaseStatus');
    statusEl.textContent = message;
    statusEl.className = type ? 'firebase-status ' + type : 'firebase-status';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

document.getElementById('saveProductBtn').addEventListener('click', saveProductToFirestore);
document.getElementById('clearProductBtn').addEventListener('click', clearProductForm);
document.getElementById('loadProductsBtn').addEventListener('click', startProductsRealtimeListener);
document.getElementById('cancelEditBtn').addEventListener('click', function() {
    clearProductForm();
    setFirebaseStatus('Edit cancelled.');
});
document.getElementById('productsTableBody').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    if (button.dataset.action === 'edit') {
        startEditProduct(button.dataset.id);
    } else if (button.dataset.action === 'delete') {
        deleteProduct(button.dataset.id);
    }
});

window.addEventListener('load', initializeFirebase);

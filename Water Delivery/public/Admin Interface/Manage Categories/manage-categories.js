let db = null;
let currentCategories = [];
let editingCategoryId = null;
let categoriesUnsubscribe = null;

const categoriesCollectionName = 'categories';

function initializeFirebase() {
    if (!window.firebase || !firebase.apps || firebase.apps.length === 0 || !firebase.firestore) {
        setFirebaseStatus('Firestore is not loaded. Open this page through Firebase Hosting or the Firebase emulator.', 'error');
        return;
    }

    db = firebase.firestore();
    startCategoriesRealtimeListener();
}

function getCategoryFormData() {
    return {
        name: document.getElementById('categoryName').value.trim(),
        description: document.getElementById('categoryDescription').value.trim(),
        sortOrder: Number(document.getElementById('sortOrder').value),
        active: document.getElementById('categoryActive').checked
    };
}

function validateCategoryData(category) {
    if (!category.name) {
        return 'Please enter the category name.';
    }

    if (!Number.isInteger(category.sortOrder) || category.sortOrder < 0) {
        return 'Sort order must be 0 or higher.';
    }

    return '';
}

async function saveCategoryToFirestore() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const category = getCategoryFormData();
    const validationMessage = validateCategoryData(category);
    if (validationMessage) {
        setFirebaseStatus(validationMessage, 'error');
        return;
    }

    const saveBtn = document.getElementById('saveCategoryBtn');
    saveBtn.disabled = true;
    setFirebaseStatus('Saving category to Firestore...');

    try {
        if (editingCategoryId) {
            await db.collection(categoriesCollectionName).doc(editingCategoryId).update({
                ...category,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Category updated in Firestore.', 'success');
        } else {
            await db.collection(categoriesCollectionName).add({
                ...category,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Category saved to Firestore.', 'success');
        }

        clearCategoryForm();
    } catch (error) {
        console.error('Error saving category:', error);
        setFirebaseStatus('Could not save category: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

function startCategoriesRealtimeListener() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const loadBtn = document.getElementById('loadCategoriesBtn');
    loadBtn.disabled = true;
    setFirebaseStatus('Listening for Firestore category updates...');

    try {
        if (categoriesUnsubscribe) {
            categoriesUnsubscribe();
        }

        categoriesUnsubscribe = db.collection(categoriesCollectionName).orderBy('sortOrder', 'asc').onSnapshot((snapshot) => {
            currentCategories = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderCategories(currentCategories);
            setFirebaseStatus('Categories are live from Firestore.', 'success');
            loadBtn.disabled = false;
        }, (error) => {
            console.error('Error listening to categories:', error);
            setFirebaseStatus('Could not listen to Firestore categories: ' + error.message, 'error');
            loadBtn.disabled = false;
        });
    } catch (error) {
        console.error('Error starting category listener:', error);
        setFirebaseStatus('Could not start category updates: ' + error.message, 'error');
        loadBtn.disabled = false;
    }
}

function renderCategories(categories) {
    const tableBody = document.getElementById('categoriesTableBody');

    if (categories.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No categories saved yet.</td></tr>';
        return;
    }

    tableBody.innerHTML = categories.map((category) => {
        const statusClass = category.active === false ? 'status-inactive' : 'status-active';
        const statusText = category.active === false ? 'Inactive' : 'Active';

        return `
            <tr>
                <td>${escapeHtml(category.name || '')}</td>
                <td>${escapeHtml(category.description || '')}</td>
                <td>${escapeHtml(String(category.sortOrder ?? 0))}</td>
                <td><span class="status-pill ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="btn btn-small btn-edit" data-action="edit" data-id="${escapeHtml(category.id)}">Edit</button>
                        <button type="button" class="btn btn-small btn-delete" data-action="delete" data-id="${escapeHtml(category.id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function startEditCategory(categoryId) {
    const category = currentCategories.find((item) => item.id === categoryId);

    if (!category) {
        setFirebaseStatus('Could not find category to edit.', 'error');
        return;
    }

    document.getElementById('categoryName').value = category.name || '';
    document.getElementById('categoryDescription').value = category.description || '';
    document.getElementById('sortOrder').value = Number(category.sortOrder) || 0;
    document.getElementById('categoryActive').checked = category.active !== false;
    editingCategoryId = categoryId;

    document.getElementById('saveCategoryBtn').textContent = 'Update Category';
    document.getElementById('cancelEditBtn').hidden = false;
    setFirebaseStatus('Editing category. Update fields and save.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteCategory(categoryId) {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const category = currentCategories.find((item) => item.id === categoryId);
    const categoryName = category && category.name ? category.name : 'this category';

    if (!confirm('Delete ' + categoryName + '? Products assigned to this category will keep the old category id.')) {
        return;
    }

    setFirebaseStatus('Deleting category...');

    try {
        await db.collection(categoriesCollectionName).doc(categoryId).delete();
        if (editingCategoryId === categoryId) {
            clearCategoryForm();
        }
        setFirebaseStatus('Category deleted.', 'success');
    } catch (error) {
        console.error('Error deleting category:', error);
        setFirebaseStatus('Could not delete category: ' + error.message, 'error');
    }
}

function clearCategoryForm() {
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryDescription').value = '';
    document.getElementById('sortOrder').value = 0;
    document.getElementById('categoryActive').checked = true;
    editingCategoryId = null;
    document.getElementById('saveCategoryBtn').textContent = 'Save Category to Firestore';
    document.getElementById('cancelEditBtn').hidden = true;
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

document.getElementById('saveCategoryBtn').addEventListener('click', saveCategoryToFirestore);
document.getElementById('clearCategoryBtn').addEventListener('click', clearCategoryForm);
document.getElementById('loadCategoriesBtn').addEventListener('click', startCategoriesRealtimeListener);
document.getElementById('cancelEditBtn').addEventListener('click', function() {
    clearCategoryForm();
    setFirebaseStatus('Edit cancelled.');
});
document.getElementById('categoriesTableBody').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    if (button.dataset.action === 'edit') {
        startEditCategory(button.dataset.id);
    } else if (button.dataset.action === 'delete') {
        deleteCategory(button.dataset.id);
    }
});

window.addEventListener('load', initializeFirebase);

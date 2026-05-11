let db = null;
let currentDrivers = [];
let currentZones = [];
let editingDriverId = null;
let driversUnsubscribe = null;
let zonesUnsubscribe = null;

const driversCollectionName = 'drivers';
const zonesCollectionName = 'zones';

function initializeFirebase() {
    if (!window.firebase || !firebase.apps || firebase.apps.length === 0 || !firebase.firestore) {
        setFirebaseStatus('Firestore is not loaded. Open this page through Firebase Hosting or the Firebase emulator.', 'error');
        return;
    }

    db = firebase.firestore();
    startZonesRealtimeListener();
    startDriversRealtimeListener();
}

function startZonesRealtimeListener() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    try {
        if (zonesUnsubscribe) {
            zonesUnsubscribe();
        }

        zonesUnsubscribe = db.collection(zonesCollectionName).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            currentZones = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderZonesChecklist();
            renderDrivers(currentDrivers);
        }, (error) => {
            console.error('Error listening to zones:', error);
            setFirebaseStatus('Could not load operational zones: ' + error.message, 'error');
            renderZonesChecklist();
        });
    } catch (error) {
        console.error('Error starting zone listener:', error);
        setFirebaseStatus('Could not start operational zone updates: ' + error.message, 'error');
    }
}

function startDriversRealtimeListener() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const loadBtn = document.getElementById('loadDriversBtn');
    loadBtn.disabled = true;
    setFirebaseStatus('Listening for Firestore driver updates...');

    try {
        if (driversUnsubscribe) {
            driversUnsubscribe();
        }

        driversUnsubscribe = db.collection(driversCollectionName).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            currentDrivers = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderDrivers(currentDrivers);
            setFirebaseStatus('Drivers are live from Firestore.', 'success');
            loadBtn.disabled = false;
        }, (error) => {
            console.error('Error listening to drivers:', error);
            setFirebaseStatus('Could not listen to Firestore drivers: ' + error.message, 'error');
            loadBtn.disabled = false;
        });
    } catch (error) {
        console.error('Error starting driver listener:', error);
        setFirebaseStatus('Could not start driver updates: ' + error.message, 'error');
        loadBtn.disabled = false;
    }
}

function renderZonesChecklist() {
    const checklist = document.getElementById('zonesChecklist');
    const selectedIds = getSelectedZoneIds();

    if (currentZones.length === 0) {
        checklist.innerHTML = '<p class="empty-zones">No zones found. Create delivery zones first from Manage Zones.</p>';
        return;
    }

    checklist.innerHTML = currentZones.map((zone) => {
        const zoneName = zone.name || zone.label || 'Unnamed zone';
        const checked = selectedIds.includes(zone.id) ? 'checked' : '';

        return `
            <label class="zone-option">
                <input type="checkbox" name="operationalZone" value="${escapeHtml(zone.id)}" ${checked}>
                <span>${escapeHtml(zoneName)}</span>
            </label>
        `;
    }).join('');
}

function getDriverFormData() {
    const operationalZoneIds = getSelectedZoneIds();
    const operationalZones = operationalZoneIds.map((zoneId) => {
        const zone = currentZones.find((item) => item.id === zoneId);

        return {
            id: zoneId,
            name: zone ? zone.name || zone.label || 'Unnamed zone' : 'Unknown zone'
        };
    });

    return {
        name: document.getElementById('driverName').value.trim(),
        phone1: document.getElementById('phone1').value.trim(),
        phone2: document.getElementById('phone2').value.trim(),
        operationalZoneIds,
        operationalZones,
        maxLoadedOrders: Number(document.getElementById('maxOrders').value),
        active: true
    };
}

function validateDriverData(driver) {
    if (!driver.name) {
        return 'Please enter the driver name.';
    }

    if (!driver.phone1) {
        return 'Please enter phone 1.';
    }

    if (driver.operationalZoneIds.length === 0) {
        return 'Please choose at least one operational zone.';
    }

    if (!Number.isInteger(driver.maxLoadedOrders) || driver.maxLoadedOrders < 1) {
        return 'Maximum loaded orders must be at least 1.';
    }

    if (driver.maxLoadedOrders > 50) {
        return 'Maximum loaded orders cannot be more than 50.';
    }

    return '';
}

async function saveDriverToFirestore() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const driver = getDriverFormData();
    const validationMessage = validateDriverData(driver);
    if (validationMessage) {
        setFirebaseStatus(validationMessage, 'error');
        return;
    }

    const saveBtn = document.getElementById('saveDriverBtn');
    saveBtn.disabled = true;
    setFirebaseStatus('Saving driver to Firestore...');

    try {
        if (editingDriverId) {
            await db.collection(driversCollectionName).doc(editingDriverId).update({
                ...driver,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Driver updated in Firestore.', 'success');
        } else {
            await db.collection(driversCollectionName).add({
                ...driver,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Driver saved to Firestore.', 'success');
        }

        clearDriverForm();
    } catch (error) {
        console.error('Error saving driver:', error);
        setFirebaseStatus('Could not save driver: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

function renderDrivers(drivers) {
    const tableBody = document.getElementById('driversTableBody');

    if (drivers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6">No drivers saved yet.</td></tr>';
        return;
    }

    tableBody.innerHTML = drivers.map((driver) => {
        return `
            <tr>
                <td>${escapeHtml(driver.name || '')}</td>
                <td>${escapeHtml(driver.phone1 || '')}</td>
                <td>${escapeHtml(driver.phone2 || '')}</td>
                <td>${getZonesCellHtml(driver)}</td>
                <td>${escapeHtml(String(driver.maxLoadedOrders || ''))}</td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="btn btn-small btn-edit" data-action="edit" data-id="${escapeHtml(driver.id)}">Edit</button>
                        <button type="button" class="btn btn-small btn-delete" data-action="delete" data-id="${escapeHtml(driver.id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getZonesCellHtml(driver) {
    const zones = getDriverZoneNames(driver);

    if (zones.length === 0) {
        return 'No zones assigned';
    }

    return `
        <div class="zones-cell">
            ${zones.map((zoneName) => `<span class="zone-pill">${escapeHtml(zoneName)}</span>`).join('')}
        </div>
    `;
}

function getDriverZoneNames(driver) {
    if (Array.isArray(driver.operationalZones) && driver.operationalZones.length > 0) {
        return driver.operationalZones.map((zone) => zone.name || zone.id || 'Unnamed zone');
    }

    if (!Array.isArray(driver.operationalZoneIds)) {
        return [];
    }

    return driver.operationalZoneIds.map((zoneId) => {
        const zone = currentZones.find((item) => item.id === zoneId);
        return zone ? zone.name || zone.label || 'Unnamed zone' : zoneId;
    });
}

function startEditDriver(driverId) {
    const driver = currentDrivers.find((item) => item.id === driverId);

    if (!driver) {
        setFirebaseStatus('Could not find driver to edit.', 'error');
        return;
    }

    document.getElementById('driverName').value = driver.name || '';
    document.getElementById('phone1').value = driver.phone1 || '';
    document.getElementById('phone2').value = driver.phone2 || '';
    document.getElementById('maxOrders').value = Number(driver.maxLoadedOrders) || 1;

    editingDriverId = driverId;
    renderZonesChecklist();
    setSelectedZoneIds(Array.isArray(driver.operationalZoneIds) ? driver.operationalZoneIds : []);

    document.getElementById('saveDriverBtn').textContent = 'Update Driver';
    document.getElementById('cancelEditBtn').hidden = false;
    setFirebaseStatus('Editing driver. Update fields and save.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteDriver(driverId) {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const driver = currentDrivers.find((item) => item.id === driverId);
    const driverName = driver && driver.name ? driver.name : 'this driver';

    if (!confirm('Delete ' + driverName + '?')) {
        return;
    }

    setFirebaseStatus('Deleting driver...');

    try {
        await db.collection(driversCollectionName).doc(driverId).delete();
        if (editingDriverId === driverId) {
            clearDriverForm();
        }
        setFirebaseStatus('Driver deleted.', 'success');
    } catch (error) {
        console.error('Error deleting driver:', error);
        setFirebaseStatus('Could not delete driver: ' + error.message, 'error');
    }
}

function clearDriverForm() {
    document.getElementById('driverName').value = '';
    document.getElementById('phone1').value = '';
    document.getElementById('phone2').value = '';
    document.getElementById('maxOrders').value = 5;
    editingDriverId = null;
    setSelectedZoneIds([]);
    document.getElementById('saveDriverBtn').textContent = 'Save Driver to Firestore';
    document.getElementById('cancelEditBtn').hidden = true;
}

function getSelectedZoneIds() {
    return Array.from(document.querySelectorAll('input[name="operationalZone"]:checked')).map((input) => input.value);
}

function setSelectedZoneIds(zoneIds) {
    document.querySelectorAll('input[name="operationalZone"]').forEach((input) => {
        input.checked = zoneIds.includes(input.value);
    });
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

document.getElementById('saveDriverBtn').addEventListener('click', saveDriverToFirestore);
document.getElementById('clearDriverBtn').addEventListener('click', clearDriverForm);
document.getElementById('loadDriversBtn').addEventListener('click', startDriversRealtimeListener);
document.getElementById('refreshZonesBtn').addEventListener('click', startZonesRealtimeListener);
document.getElementById('cancelEditBtn').addEventListener('click', function() {
    clearDriverForm();
    setFirebaseStatus('Edit cancelled.');
});
document.getElementById('driversTableBody').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    if (button.dataset.action === 'edit') {
        startEditDriver(button.dataset.id);
    } else if (button.dataset.action === 'delete') {
        deleteDriver(button.dataset.id);
    }
});

window.addEventListener('load', initializeFirebase);

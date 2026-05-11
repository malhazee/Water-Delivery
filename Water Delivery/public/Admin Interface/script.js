const content = document.getElementById('content');

const views = {
    dashboard: `
        <h2>Dashboard</h2>
        <p>Welcome to the admin dashboard. Use the menu on the left to manage the system.</p>
    `,
    drivers: `
        <h2>Manage Drivers</h2>
        <p>View, add, edit, or remove driver records here.</p>
    `,
    station: `
        <h2>Manage Station</h2>
        <iframe
            src="Manage Station/manage-station.html"
            title="Manage Station"
            style="width: 100%; min-height: 80vh; border: 0; display: block;"
        ></iframe>
    `,
    zones: `
        <h2>Manage Zones</h2>
        <p>Create, update, or review delivery zones here.</p>
    `,
    orders: `
        <h2>Manage Orders</h2>
        <p>Review and process customer orders in this area.</p>
    `
};

function showView(viewName) {
    content.innerHTML = views[viewName] || '<h2>Content</h2><p>Select an item from the menu.</p>';
}

document.querySelectorAll('nav a[data-view]').forEach((link) => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        showView(link.dataset.view);
    });
});

showView('dashboard');

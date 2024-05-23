document.addEventListener('DOMContentLoaded', (event) => {
    const toggleButton = document.getElementById('toggle-button');
    const closeButton = document.getElementById('close-button');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    function closeSidebar() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        setTimeout(() => {
            toggleButton.classList.remove('hidden');
        }, 200); // delayed
    }

    toggleButton.addEventListener('click', () => {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        toggleButton.classList.add('hidden');
    });

    closeButton.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
});
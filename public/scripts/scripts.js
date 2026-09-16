document.addEventListener('DOMContentLoaded', (event) => {
    // Sidebar toggle
    const toggleButton = document.getElementById('toggle-button');
    const closeButton = document.getElementById('close-button');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    function closeSidebar() {
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        setTimeout(() => {
            if (toggleButton) toggleButton.classList.remove('hidden');
        }, 200);
    }

    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            if (sidebar) sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
            toggleButton.classList.add('hidden');
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', closeSidebar);
    }

    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // PDF rendering functionality
    const metaElement = document.querySelector('meta[name="pdf-url"]');
    if (metaElement) {
        const url = metaElement.getAttribute('content');
        let pdfDoc = null,
            currentPage = 1,
            totalPageCount = 0,
            showBlankPage = false,
            isSinglePageView = window.innerWidth <= 768;

        const page1 = document.getElementById('page1');
        const page2 = document.getElementById('page2');
        const toggleSwitch = document.getElementById('toggleSwitch');
        const prevButton = document.getElementById('prevButton');
        const nextButton = document.getElementById('nextButton');

        console.log("Loading PDF...");
        pdfjsLib.getDocument(url).promise.then(pdfDoc_ => {
            console.log("PDF Loaded");
            pdfDoc = pdfDoc_;
            totalPageCount = pdfDoc.numPages;
            adjustScaleAndRender(); // Adjust scale and render pages
        }).catch(error => {
            console.error('Error loading PDF:', error);
        });

        function updateButtonStates() {
            if (isSinglePageView) {
                prevButton.disabled = (currentPage <= 1);
                nextButton.disabled = (currentPage >= totalPageCount);
            } else {
                prevButton.disabled = (currentPage <= 2);
                nextButton.disabled = (currentPage >= totalPageCount || currentPage + 1 >= totalPageCount);
            }
        }

        let renderTask = null;

        function renderPage(pageNumber, canvas, scale) {
            return pdfDoc.getPage(pageNumber).then(page => {
                let viewport = page.getViewport({ scale: scale });

                console.log(`Rendering Page ${pageNumber} with scale ${scale}: width=${Math.round(viewport.width)}, height=${Math.round(viewport.height)}, area=${Math.round(viewport.width) * Math.round(viewport.height)}`);

                const context = canvas.getContext('2d');
                canvas.height = Math.round(viewport.height);
                canvas.width = Math.round(viewport.width);

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };

                if (renderTask) {
                    renderTask.cancel();
                }

                renderTask = page.render(renderContext);
                return renderTask.promise.then(() => {
                    renderTask = null;
                    console.log(`Page ${pageNumber} rendered`);
                }).catch(error => {
                    if (error.name === 'RenderingCancelledException') {
                        return Promise.resolve();
                    } else {
                        console.error('Error rendering page:', error);
                        clearCanvas(canvas);
                        return Promise.resolve();
                    }
                });
            }).catch(error => {
                console.error('Error rendering page:', error);
                clearCanvas(canvas);
                return Promise.resolve();
            });
        }

        const MAX_PIXELS = 2000000;

        function adjustScaleAndRender() {
            pdfDoc.getPage(1).then(page => {
                let scale = 6.0;
                let viewport = page.getViewport({ scale: scale });

                while (viewport.width * viewport.height > MAX_PIXELS) {
                    scale *= 0.9;
                    viewport = page.getViewport({ scale: scale });
                }

                console.log(`Initial rendering with scale ${scale}: width=${viewport.width}, height=${viewport.height}, area=${viewport.width * viewport.height}`);

                renderPage(1, page1, scale).then(() => {
                    console.log('First page rendered');
                    clearCanvas(page2);
                    renderPages(scale);
                    updateButtonStates();
                });
            }).catch(error => {
                console.error('Error adjusting scale:', error);
            });
        }

        function renderPages(scale) {
            if (isSinglePageView) {
                renderPage(currentPage, page1, scale).then(() => {
                    clearCanvas(page2);
                    updateButtonStates();
                });
            } else {
                if (showBlankPage) {
                    if (currentPage === 1) {
                        renderBlankPage(page2); // Blank page should be on the left
                        if (currentPage <= totalPageCount) {
                            renderPage(currentPage, page1, scale).then(updateButtonStates); // Render page1 on the right
                        } else {
                            clearCanvas(page1);
                            updateButtonStates();
                        }
                    } else if (currentPage === totalPageCount && totalPageCount % 2 === 0) {
                        renderPage(currentPage - 1, page2, scale).then(() => { // Render previous page on the left
                            renderBlankPage(page1); // Blank page should be on the right
                            updateButtonStates();
                        });
                    } else {
                        renderPage(currentPage - 1, page2, scale).then(() => { // Render previous page on the left
                            if (currentPage <= totalPageCount) {
                                renderPage(currentPage, page1, scale).then(updateButtonStates); // Render current page on the right
                            } else {
                                clearCanvas(page1);
                                updateButtonStates();
                            }
                        });
                    }
                } else {
                    if (currentPage === totalPageCount && totalPageCount % 2 === 1) {
                        renderPage(currentPage, page1, scale).then(() => {
                            clearCanvas(page2);
                            page2.style.display = 'none';
                            updateButtonStates();
                        });
                    } else {
                        page2.style.display = 'block';
                        renderPage(currentPage, page2, scale).then(() => { // Render current page on the left
                            if (currentPage + 1 <= totalPageCount) {
                                renderPage(currentPage + 1, page1, scale).then(updateButtonStates); // Render next page on the right
                            } else {
                                updateButtonStates();
                            }
                        });
                    }
                }
            }

            if (totalPageCount === 1) {
                toggleSwitch.disabled = true;
                toggleSwitch.style.backgroundColor = 'gray';
                toggleSwitch.style.cursor = 'not-allowed';
                toggleSwitch.classList.add('disabled');
            } else {
                toggleSwitch.disabled = false;
                toggleSwitch.style.backgroundColor = '';
                toggleSwitch.style.cursor = '';
                toggleSwitch.classList.remove('disabled');
            }
        }

        function renderBlankPage(canvas) {
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = '45%';
            canvas.height = 'auto';
            context.fillStyle = "#343537";
            context.fillRect(0, 0, canvas.width, canvas.height);
        }

        function clearCanvas(canvas) {
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);
        }

        toggleSwitch.addEventListener('click', () => {
            showBlankPage = !showBlankPage;
            toggleSwitch.classList.toggle('on', showBlankPage);

            if (showBlankPage) {
                if (totalPageCount % 2 === 0) {
                    totalPageCount += 2;
                } else {
                    totalPageCount += 1;
                }
            } else {
                if (totalPageCount % 2 === 0) {
                    totalPageCount -= 2;
                } else {
                    totalPageCount -= 1;
                }
            }

            adjustScaleAndRender(); // Recalculate scale and render pages
        });

        prevButton.addEventListener('click', () => {
            if (isSinglePageView) {
                if (currentPage > 1) {
                    currentPage--;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            } else {
                if (currentPage > 2) {
                    currentPage -= 2;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            }
            updateButtonStates();
        });

        nextButton.addEventListener('click', () => {
            if (isSinglePageView) {
                if (currentPage < totalPageCount) {
                    currentPage++;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            } else {
                if (currentPage + 1 < totalPageCount) {
                    currentPage += 2;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                } else if (currentPage < totalPageCount) {
                    currentPage++;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            }
            updateButtonStates();
        });

        window.addEventListener('resize', () => {
            isSinglePageView = window.innerWidth <= 768;
            adjustScaleAndRender(); // Recalculate scale and render pages
            updateButtonStates();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowRight') {
                prevButton.click();
            } else if (event.key === 'ArrowLeft') {
                nextButton.click();
            }
        });

        let startX = 0;
        let endX = 0;

        const pageContainer = document.querySelector('.page-container');

        pageContainer.addEventListener('touchstart', handleTouchStart);
        pageContainer.addEventListener('touchend', handleTouchEnd);
        pageContainer.addEventListener('mousedown', handleMouseDown);
        pageContainer.addEventListener('mouseup', handleMouseUp);

        function handleTouchStart(e) {
            startX = e.touches[0].clientX;
        }

        function handleTouchEnd(e) {
            endX = e.changedTouches[0].clientX;
            handleSwipe();
        }

        function handleMouseDown(e) {
            startX = e.clientX;
        }

        function handleMouseUp(e) {
            endX = e.clientX;
            handleSwipe();
        }

        function handleSwipe() {
            if (startX - endX > 50) {
                prevPage();
            } else if (endX - startX > 50) {
                nextPage();
            }
        }

        function nextPage() {
            if (isSinglePageView) {
                if (currentPage < totalPageCount) {
                    currentPage++;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            } else {
                if (currentPage + 2 <= totalPageCount) {
                    currentPage += 2;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            }
        }

        function prevPage() {
            if (isSinglePageView) {
                if (currentPage > 1) {
                    currentPage--;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            } else {
                if (currentPage > 2) {
                    currentPage -= 2;
                    adjustScaleAndRender(); // Recalculate scale and render pages
                }
            }
        }
    }

    const fullscreenToggle = document.getElementById('fullscreenToggle');
    const viewerContainer = document.querySelector('.viewer-container');
    const pageContainer = document.querySelector('.page-container');

    fullscreenToggle.addEventListener('click', () => {
        document.body.classList.toggle('fullscreen');
        fullscreenToggle.querySelector('.toggle-switch').classList.toggle('on');
        adjustPageSize();
    });

    function adjustPageSize() {
        if (document.body.classList.contains('fullscreen')) {
            page1.style.height = '100%';
            page2.style.height = '100%';
        } else {
            page1.style.height = '';
            page2.style.height = '';
        }
    }

    const socket = io();
    const chatContainer = document.getElementById('chatContainer');
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatToggleButton = document.getElementById('chat-toggle-button');
    const chatCloseButton = document.getElementById('chat-close-button');
    const chatOverlay = document.getElementById('chat-overlay');
    const comicId = chatContainer?.dataset.comicId;
    const username = chatContainer?.dataset.username || 'guest';
    const userColor = getRandomColor();

    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    function toggleChat() {
        chatContainer.classList.toggle('active');
        chatOverlay.classList.toggle('active');
    }

    if (comicId) {
        socket.emit('joinRoom', { comicId, username });
    }

    if (chatToggleButton) {
        chatToggleButton.addEventListener('click', toggleChat);
    }

    if (chatCloseButton) {
        chatCloseButton.addEventListener('click', toggleChat);
    }

    if (chatOverlay) {
        chatOverlay.addEventListener('click', toggleChat);
    }

    socket.on('message', ({ username, message, timestamp }) => {
        if (chatMessages) {
            const div = document.createElement('div');
            div.classList.add('chat-message');
            div.innerHTML = `<span class="chat-username" style="color:${userColor}">${username}</span>: ${message} <span class="chat-timestamp">${new Date(timestamp).toLocaleString()}</span>`;
            chatMessages.appendChild(div);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });

    if (chatForm) {
        chatForm.addEventListener('submit', event => {
            event.preventDefault();
            const message = chatInput.value;
            socket.emit('sendMessage', { comicId, username, message });
            chatInput.value = '';
            chatInput.focus();
        });
    }
});

// Infinite Scroll
document.addEventListener('DOMContentLoaded', (event) => {
    const comicsContainer = document.querySelector('.comics-container');
    const placeholder = document.createElement('div');
    placeholder.className = 'loading-placeholder';
    placeholder.innerText = '読み込み中...';
    comicsContainer.appendChild(placeholder);

    let page = 1;
    const limit = 32;
    let loading = false;

    const loadMoreComics = async () => {
        if (loading) return;
        loading = true;
        page++;

        try {
            const response = await fetch(`/comics?page=${page}&limit=${limit}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const newComics = await response.json();

            if (newComics.length > 0) {
                newComics.forEach(comic => {
                    const comicItem = document.createElement('div');
                    comicItem.className = 'comic-item';
                    comicItem.onclick = () => location.href = `/viewer/${comic.id}`;

                    const thumbnail = document.createElement('div');
                    thumbnail.className = 'comic-thumbnail';
                    thumbnail.style.backgroundImage = `url('/uploads/${comic.thumbnail}')`;

                    const title = document.createElement('div');
                    title.className = 'comic-title';
                    title.innerText = comic.title.length > 12 ? comic.title.substring(0, 12) + '...' : comic.title;

                    comicItem.appendChild(thumbnail);
                    comicItem.appendChild(title);

                    comicsContainer.insertBefore(comicItem, placeholder);
                });
                loading = false;
            } else {
                placeholder.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading more comics:', error);
            placeholder.innerText = 'エラーが発生しました。';
        }
    };

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadMoreComics();
        }
    });

    observer.observe(placeholder);
});

const selectAllButton = document.getElementById('selectAll');
const deleteForm = document.getElementById('deleteForm');
const deleteSelectedButton = document.getElementById('deleteSelected');
const comicCheckboxes = document.querySelectorAll('.comic-checkbox');
const deleteButtons = document.querySelectorAll('.delete-button');
const roleSelects = document.querySelectorAll('.role-select');

selectAllButton.addEventListener('click', () => {
    const allSelected = Array.from(comicCheckboxes).every(checkbox => checkbox.checked);
    comicCheckboxes.forEach(checkbox => {
        checkbox.checked = !allSelected;
    });
});

deleteForm.addEventListener('submit', (event) => {
    const selectedComicIds = [];
    comicCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedComicIds.push(checkbox.value);
        }
    });
    if (selectedComicIds.length === 0) {
        event.preventDefault();
        alert('削除する漫画を少なくとも一本選択してください。');
    } else {
        const confirmed = confirm('本当に削除を行いますか？削除した漫画の復旧はできません');
        if (!confirmed) {
            event.preventDefault();
        } else {
            document.getElementById('comicIds').value = JSON.stringify(selectedComicIds);
        }
    }
});

deleteButtons.forEach(button => {
    button.addEventListener('click', (event) => {
        const comicId = button.getAttribute('data-id');
        const confirmed = confirm('本当に削除を行いますか？削除した漫画の復旧はできません');
        if (confirmed) {
            fetch('/delete-comic', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ comicIds: [comicId] })
            })
                .then(response => {
                    if (response.redirected) {
                        window.location.href = response.url;
                    } else {
                        return response.json();
                    }
                })
                .then(data => {
                    if (data && data.message !== 'success') {
                        alert('Failed to delete the comic.');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                });
        }
    });
});

roleSelects.forEach(select => {
    select.addEventListener('change', (event) => {
        const comicId = select.getAttribute('data-id');
        const newRole = select.value;

        fetch('/update-comic-role', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ comicId, newRole })
        })
            .then(response => response.json())
            .then(data => {
                if (data.message !== 'success') {
                    alert('Failed to update comic role.');
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    let cart = [];

    // Add to Cart functionality
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', (e) => {
            const productDiv = e.target.closest('.product-card');
            const quantity = parseInt(productDiv.querySelector('.quantity').value);
            if (quantity > 0) {
                const name = productDiv.querySelector('h3').textContent;
                const price = parseInt(productDiv.querySelector('.quantity').dataset.price);

                const existingItem = cart.find(item => item.name === name);
                if (existingItem) {
                    existingItem.quantity += quantity;
                } else {
                    cart.push({ name, quantity, price, image: `/images/${name.toLowerCase()}.jpg` });
                }

                updateCartDisplay();
            }
        });
    });

    // Place Order functionality
    document.getElementById('place-order')?.addEventListener('click', () => {
        if (cart.length === 0) return alert('Your cart is empty!');
        const address = document.getElementById('delivery-address').value;
        if (!address) return alert('Please provide a delivery address.');

        showLoadingSpinner();
        fetch('/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: cart, address })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                cart = [];
                updateCartDisplay();
                location.reload();
            }
        });
    });

    // Update Cart Display
    function updateCartDisplay() {
        const cartItems = document.getElementById('cart-items');
        const totalItemsEl = document.getElementById('total-items');
        const totalAmountEl = document.getElementById('total-amount');

        if (cart.length === 0) {
            cartItems.innerHTML = '<p class="empty-cart">Your cart is empty.</p>';
            totalItemsEl.textContent = '0';
            totalAmountEl.textContent = '0';
            return;
        }

        cartItems.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                <div class="cart-item-details">
                    <h4>${item.name}</h4>
                    <p>₹${item.price} x ${item.quantity} = ₹${item.quantity * item.price}</p>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="updateQuantity(${index}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity(${index}, 1)">+</button>
                    <button class="remove-btn" onclick="removeFromCart(${index})">Remove</button>
                </div>
            </div>
        `).join('');

        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);
        totalItemsEl.textContent = totalItems;
        totalAmountEl.textContent = totalAmount;
    }

    // Page Transition Handling
    document.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showLoadingSpinner();
            setTimeout(() => {
                window.location.href = link.href;
            }, 500); // Simulate a delay for the loading spinner
        });
    });

    // Form Submission Handling
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => {
            showLoadingSpinner();
        });
    });

    // Loading Spinner Functions
    function showLoadingSpinner() {
        const spinner = document.getElementById('loading-spinner');
        spinner.style.display = 'flex';
    }

    // Expose functions to global scope
    window.updateQuantity = (index, change) => {
        cart[index].quantity += change;
        if (cart[index].quantity <= 0) {
            cart.splice(index, 1);
        }
        updateCartDisplay();
    };

    // Sorting function
    window.sortOrders = (sortBy) => {
        showLoadingSpinner();
        const url = new URL(window.location.href);
        if (sortBy) {
            url.searchParams.set('sortBy', sortBy);
        } else {
            url.searchParams.delete('sortBy');
        }
        window.location.href = url.toString();
    };

    window.removeFromCart = (index) => {
        cart.splice(index, 1);
        updateCartDisplay();
    };
});

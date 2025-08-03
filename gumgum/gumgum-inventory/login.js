document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
  
    // Dummy validation
    if (username === 'admin' && password === 'gumgum') {
      localStorage.setItem('isLoggedIn', 'true');
      window.location.href = 'index.html';
    } else {
      alert('Incorrect username or password. Try admin / gumgum');
    }
  });
  
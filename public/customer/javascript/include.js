// fetch header.html and inject into #header
fetch('includes/header.html')
  .then(response => response.text())
  .then(data => {
    document.getElementById('header').innerHTML = data;
  })
  .catch(err => console.error('Error loading header:', err));

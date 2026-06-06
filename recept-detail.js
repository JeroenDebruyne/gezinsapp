const p = new URLSearchParams(location.search);
const id = p.get('id');
location.replace('recepten.html' + (id ? '?id=' + encodeURIComponent(id) : ''));

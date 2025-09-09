const images = [];

for (let i = 401; i <= 677; i++) {
  images.push(`/files/gallery/library/${i}.png`);
}

const libraryImg = document.getElementById('library');
document.getElementById('prevBtn').onclick = () => {
  current = (current - 1 + images.length) % images.length;
  libraryImg.src = images[current];
};
document.getElementById('nextBtn').onclick = () => {
  current = (current + 1) % images.length;
  libraryImg.src = images[current];
};
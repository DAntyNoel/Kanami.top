const images = [
    "res/images/backgrounds/Be-Shinning.png",
    "res/images/backgrounds/Soda.png",
];
  
document.addEventListener("DOMContentLoaded", () => {
    let index = 0;
    const bg = document.querySelector(".background");
  
    // 初始化背景
    bg.style.backgroundImage = `url(${images[0]})`;
    bg.style.opacity = 1;
  
    function changeBackground() {
      bg.style.opacity = 0; // 淡出当前
      setTimeout(() => {
        index = (index + 1) % images.length;
        bg.style.backgroundImage = `url(${images[index]})`;
        bg.style.opacity = 1; // 淡入新背景
      }, 1000); // 与 CSS transition 的时间保持一致
    }
  
    setInterval(changeBackground, 30000); // 每 30 秒切换一次
  });
  
// 随机表情包展示功能
document.addEventListener("DOMContentLoaded", () => {

    const stampsDir = "res/images/stamps/";
    // 假设你提前把所有表情包文件名放入数组
    // 如果是静态网页，无法自动读取文件夹，需要手动列出
    const allStamps = [
        "001.png",
        "002.jpg",
        "003.jpg",
        "004.png",
        "005.jpg"
    ];
    const grid = document.getElementById("stamps-grid");
    const shuffleBtn = document.getElementById("shuffle-stamps");
  
    function getRandomStamps() {
      const count = 2 // Math.floor(Math.random() * 3) + 4; // 4~6 张
      const shuffled = allStamps.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    }
  
    function renderStamps() {
      const stamps = getRandomStamps();
      grid.innerHTML = "";
      stamps.forEach(file => {
        const img = document.createElement("img");
        img.src = stampsDir + file;
        img.alt = "KANAMI Stamp";
        grid.appendChild(img);
      });
    }
  
    shuffleBtn.addEventListener("click", renderStamps);
  
    renderStamps(); // 初始加载
  });
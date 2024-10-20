document.addEventListener('DOMContentLoaded', function () {
    const showMapButton = document.getElementById('btn-show-map');
    const overlayModal = document.getElementById('overlay-modal');
    const searchPoint = document.getElementById('search-input');

    // Открытие модального окна при нажатии на кнопку
    showMapButton.addEventListener('click', function () {
        overlayModal.style.display = 'flex'; // Показываем модальное окно   
        const routeBuilder = new RouteBuilder(searchPoint.value);     
    });

    // Закрытие модального окна по клику вне карты (если нужно)
    overlayModal.addEventListener('click', function (e) {
        if (e.target === overlayModal) {
            overlayModal.style.display = 'none'; // Закрываем модальное окно
        }
    });

    // Пример использования:
   
});

const debounce = (callback, delay) => {
  let timeoutId;

  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

class GeoUtils {
    // Метод для проверки загрузки ymaps и обертки других методов
    static withYmaps = (callback) => {
        const step = 100; // Интервал между попытками
        let count = 0; // Количество попыток
        let time = 0; // Задержка между попытками

        return new Promise((resolve, reject) => {
            const tryLoadYmaps = () => {
                if (window.ymaps) {
                    ymaps.ready(() => {
                        resolve(callback()); // Выполняем переданный callback, если ymaps загружен
                    });
                } else {
                    count++;
                    time += step * count;
                    console.warn('Попытка загрузки объекта ymaps №' + count);

                    if (count < 20) { // Делаем максимум 20 попыток
                        setTimeout(tryLoadYmaps, time);
                    } else {
                        console.error('Объект ymaps не был загружен после ' + count + ' попыток');
                        reject(new Error('Объект ymaps не был загружен'));
                    }
                }
            };

            tryLoadYmaps();
        });
    }

    // Метод для получения координат пользователя
    static getUserCoords = () => {
        return this.withYmaps(() => {
            return new Promise((resolve, reject) => {
                ymaps.geolocation.get({
                    provider: 'yandex',
                    mapStateAutoApply: true
                }).then((result) => {
                    const coordinates = result.geoObjects.get(0).geometry.getCoordinates();
                    resolve(coordinates);
                }).catch((error) => {
                    console.error('Ошибка получения координат:', error);
                    reject(false);
                });
            });
        });
    }

    // Метод для получения адреса по координатам
    static getAddressFromCoords = (coords) => {
        return this.withYmaps(() => {
            return new Promise((resolve, reject) => {
                ymaps.geocode(coords).then((res) => {
                    const obj = res.geoObjects.get(0);
                    const address = obj.getAddressLine(); // Полный адрес
                    const city = obj.getLocalities().length > 0 ? obj.getLocalities()[0] : null; // Город
                    resolve({ address, city });
                }).catch((error) => {
                    console.error('Ошибка геокодирования:', error);
                    reject(error);
                });
            });
        });
    }
}


class RouteBuilder {
    constructor(destinationAddress) {
        this.destinationAddress = destinationAddress;
        this.map = null;
        this.initMap();
    }

    // Метод для инициализации карты и построения маршрута
    initMap() {
        GeoUtils.getUserCoords().then((userCoords) => {
            console.log('Координаты пользователя:', userCoords);

            // Создаем карту с центром на координатах пользователя
            this.map = new ymaps.Map("map", {
                center: userCoords,
                zoom: 13
            });

            // Геокодирование: получение адреса по координатам пользователя
            GeoUtils.getAddressFromCoords(userCoords).then(({ address }) => {
                // Создаем метку в начальной точке с тултипом, отображающим адрес
                const userPlacemark = new ymaps.Placemark(userCoords, {
                    balloonContent: 'Ваше местоположение: ' + address // Отображаем адрес
                });

                // Добавляем метку на карту
                this.map.geoObjects.add(userPlacemark);

                // После того, как добавили метку, строим маршрут
                this.buildRoute(address, this.destinationAddress);
            }).catch((error) => {
                console.error('Ошибка получения адреса по координатам:', error);
                // Если не удалось получить адрес, добавляем метку с координатами
                const userPlacemark = new ymaps.Placemark(userCoords, {
                    balloonContent: 'Ваше местоположение: ' + userCoords.join(', ') // Показываем координаты
                });
                this.map.geoObjects.add(userPlacemark);
                this.buildRoute(userCoords, this.destinationAddress);
            });
        }).catch((error) => {
            alert('Не удалось получить координаты пользователя: ' + error.message);
        });
    }

    // Метод для построения маршрута
    buildRoute(userAddress, destination) {
        ymaps.route([userAddress, destination]).then((route) => {
            // Добавляем маршрут на карту
            this.map.geoObjects.add(route);

            const points = route.getWayPoints();
            const lastPoint = points.getLength() - 1;
            // Задаем стиль метки - иконки будут красного цвета, и
            // их изображения будут растягиваться под контент.
            points.options.set('preset', 'islands#redStretchyIcon');
            // Задаем контент меток в начальной и конечной точках.
            points.get(0).properties.set('iconContent', 'Точка отправления');
            points.get(lastPoint).properties.set('iconContent', 'Точка прибытия');
         
            const bounds =  points.getBounds();

            const { optimalZoom, center } = this.calculateOptimalParameters(bounds);

            console.log( { optimalZoom, center })

          

            this.map.setCenter(center);
            
            if (isFinite(optimalZoom)) {
                this.map.setZoom(optimalZoom);
            } else {
                this.map.setZoom(9);
            }
            

        }).catch((error) => {
            alert('Ошибка построения маршрута: ' + error.message);
        });
    }

    calculateOptimalParameters(bounds) {
        const southWest = [
          Math.min(...bounds.map(point => point[0])),
          Math.min(...bounds.map(point => point[1]))
        ];
        const northEast = [
          Math.max(...bounds.map(point => point[0])),
          Math.max(...bounds.map(point => point[1]))
        ];
    
        // Вычисляем центральную координату
        const center = [
          (southWest[0] + northEast[0]) / 2, // Широта
          (southWest[1] + northEast[1]) / 2  // Долгота
        ];
    
        const mapSize = this.map.container.getSize();
        const mapWidth = mapSize[0];
        const mapHeight = mapSize[1];
    
        // Определяем ширину и высоту области, охватывающей метки
        const areaWidth = northEast[1] - southWest[1];
        const areaHeight = northEast[0] - southWest[0];
    
        // Уровень зума рассчитывается исходя из размеров карты и области
        const zoomByWidth = Math.floor(Math.log2(mapWidth / areaWidth));
        const zoomByHeight = Math.floor(Math.log2(mapHeight / areaHeight));
    
        // Возвращаем минимальный зум для того, чтобы вся область была видна
        const optimalZoom = Math.min(zoomByWidth, zoomByHeight);
    
        return {
          optimalZoom: optimalZoom,
          center: center
        };
      }
  
}



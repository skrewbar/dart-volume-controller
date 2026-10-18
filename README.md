# Dart Volume Controller

다트를 던져 맞힌 점수가 그대로 볼륨이 되는 볼륨 컨트롤러.

## 점수 = 볼륨

표준 다트판 규칙을 그대로 따릅니다.

| 맞힌 곳 | 점수 |
| --- | --- |
| 싱글 | 숫자 × 1 |
| 더블 (바깥쪽 고리) | 숫자 × 2 |
| 트리플 (안쪽 고리) | 숫자 × 3 |
| 아우터 불 | 25 |
| 불스아이 | 50 |
| 빗나감 | 0 (음소거) |

한 발로 낼 수 있는 최고 점수가 트리플 20(60점)이라 볼륨도 최대 60입니다. 초기 볼륨은 30입니다.

## 실행

`index.html`을 열거나 웹 서버로 열면 됩니다.

```sh
python3 -m http.server 8000
# http://localhost:8000 접속
```

## 내 음악으로 바꾸기

오른쪽 위 **내 음악 열기**를 누르거나 오디오 파일을 페이지에 끌어다 놓으면 음악을 변경할 수 있습니다.

## 파일 구성

- `index.html` — 페이지 구조
- `style.css` — 레이아웃과 다트판 색
- `app.js` — 다트판 그리기, 조준선 움직임, 점수 계산, 다트 비행, 볼륨 조절
- `audio/lets-go-fishin.mp3` — 기본 곡

## 음원

기본 곡은 Karissa Hobbs의 ["Let's Go Fishin'"](https://freemusicarchive.org/music/Karissa_Hobbs/Age_of_Flowers/09_Lets_Go_Fishin)(앨범 *Age of Flowers*, Free Music Archive)이며 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 라이선스를 따릅니다.
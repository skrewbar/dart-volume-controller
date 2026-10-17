# Dart Volume Controller

다트를 던져 맞힌 점수가 그대로 볼륨이 되는 볼륨 컨트롤러. 빌드 과정 없는 정적 웹 페이지(HTML · CSS · JavaScript)이고, 실제 노래를 틀어 놓고 그 볼륨을 바꾼다.

## 던지는 법

1. 빨간 세로선이 좌우로 빠르게 움직인다. 클릭하거나 <kbd>Space</kbd>를 누르면 가로 위치가 고정된다.
2. 이번에는 가로선이 위아래로 움직인다. 한 번 더 클릭하거나 <kbd>Space</kbd>를 누르면 두 선이 만나는 지점으로 다트가 날아간다.
3. 맞힌 점수가 곧 볼륨(%)이 되고, 잠시 뒤 다음 다트를 던질 수 있다.

휴대폰에서는 다트판을 탭하면 된다. 노래는 첫 번째 클릭(또는 탭)과 함께 재생되고, 오른쪽 위 버튼으로 멈추거나 다시 틀 수 있다.

## 점수 = 볼륨

표준 다트판 규칙을 그대로 따른다.

| 맞힌 곳 | 점수 |
| --- | --- |
| 싱글 | 숫자 × 1 |
| 더블 (바깥쪽 고리) | 숫자 × 2 |
| 트리플 (안쪽 고리) | 숫자 × 3 |
| 아우터 불 | 25 |
| 불스아이 | 50 |
| 빗나감 | 0 (음소거) |

한 발로 낼 수 있는 최고 점수가 트리플 20(60점)이라 볼륨도 최대 60이다. 처음 볼륨은 30이다.

## 실행

정적 파일만 있으면 되므로 아무 웹 서버로나 띄우면 된다.

```sh
python3 -m http.server 8000
# http://localhost:8000 접속
```

`index.html`을 파일로 바로 열어도 동작한다. 다만 `file://`에서는 브라우저가 음원을 다른 출처로 취급해 Web Audio를 쓸 수 없어서 `audio.volume`으로 볼륨을 바꾸는데, iOS는 이 값을 무시하므로 아이폰·아이패드에서는 웹 서버로 띄워야 볼륨이 바뀐다.

GitHub Pages로 공개하려면 저장소 Settings → Pages에서 배포 브랜치를 `master`, 폴더를 `/ (root)`로 지정한다.

## 내 음악으로 바꾸기

오른쪽 위 **내 음악 열기**를 누르거나 오디오 파일을 페이지에 끌어다 놓으면 그 곡으로 바뀐다. 파일은 브라우저 안에서만 재생되고 어디에도 올라가지 않는다.

## 파일 구성

- `index.html` — 페이지 구조
- `style.css` — 레이아웃과 다트판 색
- `app.js` — 다트판 그리기, 조준선 움직임, 점수 계산, 다트 비행, 볼륨 조절
- `audio/lets-go-fishin.mp3` — 기본 곡

## 음원

기본 곡은 Karissa Hobbs의 ["Let's Go Fishin'"](https://freemusicarchive.org/music/Karissa_Hobbs/Age_of_Flowers/09_Lets_Go_Fishin)(앨범 *Age of Flowers*, Free Music Archive)이며 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 라이선스를 따른다. [librosa 예제 데이터](https://github.com/librosa/data)에 실린 Ogg Vorbis 파일을 MP3로 변환했고, 그 밖의 수정은 하지 않았다.

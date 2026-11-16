---
title: "포트폴리오"
description: "직접 작성한 웹 서버, 작은 Rust 도구, 그리고 필요해서 만든 프로젝트들입니다."
---

처음부터 계획이 있었던 것은 아닙니다.
작은 웹 앱 하나로 시작했고, 그다음 프로젝트마다 앞선 프로젝트에서는 배우지 못한 것을 배웠습니다.
이 페이지는 그 과정을 따라갑니다.
모든 코드는 [제 GitHub](https://github.com/ParkSnoopy?tab=repositories)에 있습니다.

## 내 웹 페이지 운영하기

처음 제대로 만든 프로젝트는 [AppOnRailway](https://github.com/ParkSnoopy/AppOnRailway)와 [MyShareServer](https://github.com/ParkSnoopy/MyShareServer)였습니다.
코드를 한 줄씩 직접 작성했습니다.
플랫폼이 대신 운영해 주는 페이지가 아니라, 제가 호스팅하고 관리하는 페이지를 갖고 싶었습니다.

앱을 실제로 운영하기 전까지는 쉬울 줄 알았습니다.
운영을 시작하고 나니 요청이 제 코드에 도달하는 과정, 배포 방법, 문제가 생겨도 대신 고쳐 줄 사람이 없을 때의 대응을 배워야 했습니다.

## CAPTCHA, 작은 CLI 도구, 그리고 Rust

다음은 CAPTCHA였습니다.
[captcha-gen](https://github.com/ParkSnoopy/captcha-gen)은 이미지를 만들고, [captcha-solver](https://github.com/ParkSnoopy/captcha-solver)는 그 이미지를 읽으려고 시도합니다.
만드는 쪽과 푸는 쪽을 모두 구현하니 각각의 약점이 보였습니다.

동시에 당장 불편한 일을 해결할 작은 명령줄 도구도 작성했습니다.
[rdp-shutdown](https://github.com/ParkSnoopy/rdp-shutdown)은 정해진 시간에 원격 데스크톱 컴퓨터를 종료합니다.
[rand_base64](https://github.com/ParkSnoopy/rand_base64)는 무작위 base64 문자열을 출력합니다.
하나하나가 한 번 앉아서 끝낼 수 있을 만큼 작았습니다.
대부분 Rust로 작성했고, 완성하는 과정에서 언어를 익혔습니다.

그 뒤로도 계속 프로젝트를 만들었습니다.
오래 쓴 것도 있고, 그렇지 않은 것도 있습니다.
남은 습관은 단순합니다. 필요한 도구가 있으면 만들고, 직접 씁니다.

## 같은 서버를 두 번 만들기

파일 공유 서버에 대한 생각은 계속 돌아왔습니다.
외부 서비스에 의존하지 않고 파일을 공유하고 싶었습니다.
그래서 [Django 버전](https://github.com/ParkSnoopy/django-shareserver)을 직접 작성하고 배포해 운영했습니다.
실제로 사용했습니다.

직접 운영하니 비용이 보였습니다.
실행에 필요한 자원이 많았고, 재시작도 느렸습니다.
Django 설계를 다시 검토한 뒤 Go와 SQLite로 백엔드를 새로 만들었습니다.

더 어려운 부분은 보안이었습니다.
브라우저에서 파일을 암호화해 서버에는 암호문만 저장되게 하고 싶었습니다.
이 부분을 직접 작성하기는 복잡했습니다.
요구 사항을 프롬프트로 정리하고, AI 에이전트가 브라우저의 암호화·복호화를 구현하게 했습니다. 서버의 저장 기능은 분리했습니다.
그 결과가 [shareserver](https://github.com/ParkSnoopy/shareserver)입니다.
Django 버전보다 가볍고, 보안 기능도 더 많습니다.

## 나만의 도구 만들기

AI 에이전트는 제가 시도하는 일의 범위를 바꿨습니다.
예전에는 있으면 좋겠다고 생각만 하던 도구를 이제는 만듭니다.
[debian-slim-zsh](https://github.com/ParkSnoopy/debian-slim-zsh)도 그중 하나입니다. zsh를 넣은 작은 Debian 컨테이너이자, 제가 개발하는 작업 환경입니다.

무엇을 만들지는 여전히 제가 정하고, 중요한 부분은 검토합니다.
에이전트는 반복 작업을 맡습니다.

## 다른 프로젝트

### Love

[Love](https://github.com/ParkSnoopy/Love)는 오프라인 성경 앱입니다.
계정도 인터넷 연결도 필요하지 않습니다.
본문은 앱에 포함되어 있고, 검색은 기기 안에서 실행됩니다.
기획하고, 만들고, 배포했으며, 직접 사용합니다.

가장 중요했던 결정은 데이터의 분리였습니다.
성경 본문은 읽기 전용으로 두고, 메모와 북마크는 별도로 저장합니다.
본문을 업데이트해도 메모와 북마크는 바뀌지 않습니다.
로컬 백업과 복원도 추가했습니다.

### PKU Elective Prettify

대학 시간표를 내보낸 파일은 단조롭고 읽기 어렵습니다.
[pku-elective-prettify](https://github.com/ParkSnoopy/pku-elective-prettify)는 이를 색깔이 있는 시간표로 바꿉니다.
파싱, 색상 배정, 출력을 분리해 서로 건드리지 않고 개선할 수 있게 했습니다.

Python 버전은 설치가 필요했고, 주로 Windows에 맞춰져 있었습니다.
두 문제를 줄이려고 JavaScript 웹 앱으로 다시 작성했습니다.
이제 시간표 생성, 편집, 내보내기가 모두 브라우저에서 이뤄집니다. [GitHub Pages](https://parksnoopy-undergraduate.github.io/elective/)에서 사용할 수 있습니다.

### Solarmax

Solarmax는 Python과 Pygame으로 만든 실시간 전략 게임입니다.
우주선이 행성을 돌고 행성 사이를 이동하기 때문에 극좌표, 타원, 접선이 필요했습니다.
수업에서 배웠지만 실제로 써 본 적은 없던 수학이었습니다.
게임 객체의 상태와 동작을 관리하려고 클래스와 상속도 독학했습니다.

### 연구자 이동과 연구비 시각화

데이터 시각화 수업에서 진행한 팀 프로젝트입니다.
각자 자신의 시각화 모듈을 작성했습니다.
저는 브랜치 병합과 필요한 커밋의 체리픽으로 공용 코드베이스를 관리해, 팀원들의 커밋이 이력에 남도록 했습니다.

수동 배포에서는 단계를 빠뜨리는 일이 반복됐습니다.
코드를 개발 저장소와 배포 저장소로 나눴습니다.
그다음 GitHub Actions가 필수 자산을 확인하고, 사이트를 빌드하고, GitHub Pages에 배포하도록 구성했습니다.
이 사이트도 GitHub Actions로 배포합니다.

## 주요 프로젝트

| 프로젝트 | 설명 |
| --- | --- |
| [AppOnRailway](https://github.com/ParkSnoopy/AppOnRailway) | Railway에서 호스팅한 첫 웹 앱 |
| [MyShareServer](https://github.com/ParkSnoopy/MyShareServer) | 직접 작성한 첫 파일 공유 서버 |
| [captcha-gen](https://github.com/ParkSnoopy/captcha-gen) | CAPTCHA 이미지 생성기 |
| [captcha-solver](https://github.com/ParkSnoopy/captcha-solver) | CAPTCHA 이미지 해독기 |
| [rdp-shutdown](https://github.com/ParkSnoopy/rdp-shutdown) | RDP 컴퓨터 예약 종료 도구 |
| [rand_base64](https://github.com/ParkSnoopy/rand_base64) | 무작위 base64 생성기 |
| [django-shareserver](https://github.com/ParkSnoopy/django-shareserver) | Django 버전 파일 공유 서버 |
| [shareserver](https://github.com/ParkSnoopy/shareserver) | 브라우저 암호화를 적용한 Go 버전 파일 공유 서버 |
| [debian-slim-zsh](https://github.com/ParkSnoopy/debian-slim-zsh) | zsh를 넣은 Debian 개발 컨테이너 |
| [Love](https://github.com/ParkSnoopy/Love) | 오프라인 성경 앱 |
| [pku-elective-prettify](https://github.com/ParkSnoopy/pku-elective-prettify) | 색깔이 있는 시간표 생성기 |

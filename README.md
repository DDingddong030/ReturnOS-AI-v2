# ReturnOS AI

ReturnOS AI는 패션/뷰티 이커머스 운영팀을 위한 **반품 처리 의사결정 지원 웹사이트**입니다.

백엔드 없이 브라우저에서 동작하며, 반품 데이터 등록/CSV 업로드/처리안 추천/최종 결정 저장/대시보드 분석까지 한 번에 데모할 수 있습니다.

## 주요 기능

- 업무 시작
  - 샘플 데이터 불러오기/직접 입력/CSV 업로드 시작 동선
  - CSV 양식 다운로드 및 입력 예시 보기
- 운영 현황
  - 총 반품 건수
  - 추천 처리안 분포
  - 최종 결정 기준 손실 절감액
  - 반품 사유 Top 5
  - SKU별 예상 손익
- 반품 목록
  - 검색, 필터, 정렬
  - 행 클릭 시 상세 화면 이동
- 반품 등록
  - 4개 구간(기본 정보/반품 정보/비용·가치 정보/운영 판단 정보)으로 입력 안내
- 반품 상세
  - 케이스 상세 정보
  - 처리 옵션(재판매/재포장 후 재판매/할인전환/공급사 반송/폐기) 손익 비교
  - 동적 추천 처리안 및 추천 사유 표시
  - 최종 결정 저장
- 정책 시뮬레이터
  - 회수 배송비/재포장비/쿠폰·유지 비용/폐기 기준/재고 부족 기준/시즌 임박 기준 조정
  - 정책 변경 즉시 추천 결과 반영
- 데이터 입력
  - 수기 등록 폼
  - 브라우저 내 CSV 업로드 파싱 및 검증
  - 샘플 CSV 템플릿 다운로드
- 로컬 영속성
  - `localStorage`로 반품 데이터/최종 결정/정책 설정 저장
- 데모 데이터 초기화

## 프로젝트 구조

- `index.html` : 전체 UI 구조
- `styles.css` : 화면 스타일
- `app.js` : 상태관리, 추천 로직, 렌더링, 이벤트 처리
- `data/seedData.js` : 기본 데모 데이터
- `data/sample-template.csv` : CSV 샘플 템플릿

## 실행 방법 (로컬)

아래 중 하나로 실행하면 됩니다.

### 방법 1) 파일 직접 열기

`index.html`을 브라우저로 열면 동작합니다.

### 방법 2) 간단한 정적 서버 실행 (권장)

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속

## GitHub Pages 배포

1. 저장소 루트에 현재 파일 구조를 그대로 푸시
2. GitHub 저장소 설정 → Pages
3. 배포 소스를 `main`(또는 사용 브랜치) / root로 선택
4. 몇 분 후 발급된 URL로 접속

## CSV 업로드 필수 컬럼

다음 컬럼명이 정확히 있어야 합니다.

- `orderId`
- `sku`
- `category`
- `sellingPrice`
- `returnReason`
- `conditionGrade`
- `returnShippingCost`
- `repackagingCost`
- `resaleValue`
- `discountSaleValue`
- `vendorReturnEligible`
- `vendorReturnRecoveryValue`
- `disposalCost`
- `currentStock`
- `seasonDaysLeft`
- `quantity`
- `notes`

`vendorReturnEligible` 값은 `true` 또는 `false`를 사용합니다.

## 참고

- UI는 제품명 `ReturnOS AI`를 제외한 사용자 노출 텍스트를 한국어로 구성했습니다.
- 본 프로젝트는 정적 웹사이트 기반이며 외부 API/백엔드를 사용하지 않습니다.

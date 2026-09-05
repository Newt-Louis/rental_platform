// Jenkinsfile — build & deploy THISO Leasing Platform.
//
// Yêu cầu Jenkins đã cài theo scripts/jenkins-setup.sh (agent chính là chính
// container Jenkins, có sẵn docker CLI + compose plugin qua docker-outside-
// of-docker, và openssh-client để SSH sang UAT).
//
// Credential cần tạo thủ công trong Jenkins UI trước khi chạy job UAT:
//   - ID: uat-deploy-key
//     Kind: SSH Username with private key
//     Username: root
//     Private key: key đã ssh-keygen trong container Jenkins, public key đã
//     copy vào ~/.ssh/authorized_keys của root@125.234.136.72 (xem hướng dẫn
//     cuối scripts/jenkins-setup.sh).
//
// Deploy PROD không cần credential SSH gì cả: Jenkins chạy ngay trên server
// prod (.82), dùng chung docker daemon với stack production qua
// /var/run/docker.sock (mount sẵn lúc setup) nên build xong là deploy thẳng,
// không cần push/pull registry hay scp.
pipeline {
  agent any

  parameters {
    choice(name: 'DEPLOY_ENV', choices: ['uat', 'prod'], description: 'Môi trường deploy')
  }

  environment {
    IMAGE_TAG = "${params.DEPLOY_ENV}-${new Date().format('ddMMyyyy')}-${env.BUILD_NUMBER}"
    // Phải khớp đúng prefix "registry.thisoretail.store/leasing-platform/..."
    // mà docker-compose.uat.yml và compose file trên server prod dùng trong
    // trường image: -- không push lên registry thật, chỉ dùng làm tên tag
    // local để docker compose tìm thấy đúng image đã build/load.
    IMG_NS    = "registry.thisoretail.store/leasing-platform"
    UAT_HOST  = "125.234.136.72"
    UAT_PATH  = "/home/leasing-platform"
    PROD_PATH = "/home/leasing-platform"
  }

  options {
    disableConcurrentBuilds()
    timestamps()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build images') {
      steps {
        sh """
          docker build -f apps/backend/Dockerfile -t ${IMG_NS}/backend:${IMAGE_TAG} apps/backend
          docker build -f apps/frontend/Dockerfile -t ${IMG_NS}/frontend:${IMAGE_TAG} \\
            --build-arg VITE_API_URL= --build-arg VITE_SOCKET_URL= apps/frontend
        """
      }
    }

    stage('Deploy PROD (local docker daemon)') {
      when { expression { params.DEPLOY_ENV == 'prod' } }
      steps {
        // NOTE: docker-compose.yml thực tế trên server (${PROD_PATH}) là file
        // được quản lý riêng trên server, KHÔNG phải file docker-compose.yml
        // ở gốc repo này (file đó là cấu hình dev local trên máy Windows) --
        // service name backend-prod/frontend-prod lấy theo deploy-prod.sh.
        // Nếu tên service/đường dẫn trên server khác, sửa lại khối sh dưới
        // đây cho khớp trước khi chạy job thật.
        sh """
          cd ${PROD_PATH}
          sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|' .env || true
          docker compose run --rm --no-deps backend-prod sh -c 'npx prisma migrate deploy'
          docker compose up -d backend-prod frontend-prod
          docker compose ps
        """
      }
    }

    stage('Deploy UAT (SSH sang .72)') {
      when { expression { params.DEPLOY_ENV == 'uat' } }
      steps {
        sshagent(credentials: ['uat-deploy-key']) {
          sh """
            docker save ${IMG_NS}/backend:${IMAGE_TAG} -o backend-${IMAGE_TAG}.tar
            docker save ${IMG_NS}/frontend:${IMAGE_TAG} -o frontend-${IMAGE_TAG}.tar
            scp -o StrictHostKeyChecking=no backend-${IMAGE_TAG}.tar root@${UAT_HOST}:${UAT_PATH}/backend-new.tar
            scp -o StrictHostKeyChecking=no frontend-${IMAGE_TAG}.tar root@${UAT_HOST}:${UAT_PATH}/frontend-new.tar
            rm -f backend-${IMAGE_TAG}.tar frontend-${IMAGE_TAG}.tar
            ssh -o StrictHostKeyChecking=no root@${UAT_HOST} '
              set -e
              cd ${UAT_PATH}
              docker load -i backend-new.tar  && rm -f backend-new.tar
              docker load -i frontend-new.tar && rm -f frontend-new.tar
              sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env
              docker rm -f leasing_migrate_tmp >/dev/null 2>&1 || true
              docker compose -f docker-compose.uat.yml run --rm --name leasing_migrate_tmp --no-deps backend-uat sh -c "npx prisma migrate deploy"
              docker compose -f docker-compose.uat.yml up -d
              docker compose -f docker-compose.uat.yml ps
            '
          """
        }
      }
    }
  }

  post {
    success { echo "✓ Deploy ${params.DEPLOY_ENV} thành công — tag: ${env.IMAGE_TAG}" }
    failure { echo "✗ Deploy ${params.DEPLOY_ENV} thất bại — xem log ở trên" }
    always {
      sh "docker image prune -f --filter 'label!=keep' || true"
    }
  }
}

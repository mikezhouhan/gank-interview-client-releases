gh workflow run release.yml \
      --ref main \
      --field tag=v1.7.2 \
      --field branch=dev

gh workflow run release-no-one.yml \
      --ref main \
      --field tag=v1.7.3 \
      --field branch=dev_one

gh workflow run release.yml \
      --ref main \
      --field tag=v1.0.0 \
      --field branch=dev_en

gh workflow run release.yml \
      --ref main \
      --field tag=v1.0.1 \
      --field branch=dev_en_one

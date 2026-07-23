/**
 * Curated Steam economy image hashes for catalog model-filter previews.
 * Keys are ItemDefinition.weapon labels (same as CATALOG_CATEGORY_OPTIONS).
 * Hashes are stable CDN paths — append /96fx96f for lightweight thumbs.
 */
export const CATALOG_MODEL_PREVIEW_ICON_HASHES: Readonly<Record<string, string>> =
  {
    'Glock-18': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2kpnj9h1Y-s2pZKtuK6HLMXCR0-N3ueVsQRa_nBovp3PQydf4dXuSalUgCJZwRrILthi9kYDlMe_m4g2Ij90Um3moiXkc6SZj_a9cBgLxwlYC', // Glock-18 | Bullet Queen
    'USP-S': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLkjYbf7itX6vytbbZSI-WsG3SA_uV_vO1WTCa9kxQ1vjiBpYPwJiPTcFB2Xpp5TO5cskG9lYCxZu_jsVCL3o4Xnij23ClO5ik9tegFA_It8qHJz1aWe-uc160', // Souvenir USP-S | Kill Confirmed
    'Desert Eagle': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL1m5fn8Sdk7vORbqhsLfWAMWuZxuZi_uI_TX6wxxkjsGXXnImsJ37COlUoWcByEOMOtxa5kdXmNu3htVPZjN1bjXKpkHLRfQU', // Desert Eagle | Blaze
    'P250': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLhzMOwwiFO0OL8PfRSIeOaB2qf19F6ueZhW2fixx53tWqEm4ugeXuebQN0CZJyRrMJuxm4loCyPr_i51TfjtgXzi79kGoXuUXmUJzm', // P250 | Asiimov
    'AK-47': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiVI0POlPPNSIvycAWOD0eFkpN5lRi67gVN15mmDw9egci_EPFAkDMQlTeZe4EXplNa0Yrvr5wbd345GyHioiC4b8G81tFuqg_k_', // AK-47 | Bloodsport
    'M4A4': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwiFO0P_6V6V-Kf2cGFidxOp_pewnTii3w0x_tmTRnt2qdHyWaFAjA5UlQOYI5BO5k9bhZunm41OI34NDnjK-0H3pAWw_Rw', // M4A4 | Asiimov
    'M4A1-S': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_OGMWrEwL9lj_JmWiWnlBYioQKJk4jxNWXFZ1IgC5MiQuZeuhK4wIXnMuPhslCM2oMTxH75hnxK6Htjse4BVqd25OSJ2DU2Q_CD', // M4A1-S | Chantico\'s Fire
    'Galil AR': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL2n5rp8SNJ0PG7V6doMvKBG3Svxu96ue1WQyC0nQlpsTjVzdb8IH-UOw8lX8B5EeYJ40a8k4XnPuvqsgzYjt0QnCyqh3wb7DErvbjusqqqdw', // Galil AR | Cerberus
    'AUG': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwi5Hf_jdk7vynZaFSIeWUMWuZxuZi_rZvSXDgzUV_tWWAydyqI3mQbVMiWJolTLQOtBS4w4a1MuznsVHa3YlbjXKpUc8HttI', // AUG | Akihabara Accept
    'FAMAS': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL3n5vh7h1c_M2oaalsM8-fC2CRwvdJt-5lSxa_nBovp3PUztn4d3qSPQ8kDMR5ROVb4xCxw9a0NLni4lCIio4QzXn32yMb6Sds_a9cBr1TwPEt', // FAMAS | Commemoration
    'AWP': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6V-Kf2cGFidxOp_pewnF3nhxEt0sGnSzN76dH3GOg9xC8FyEORftRe-x9PuYurq71bW3d8UnjK-0H0YSTpMGQ', // AWP | Asiimov
    'SSG 08': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLijZGwpR1Y-s29YKV_K8-fB2CY1aAmsbFtFnDilkUl5j7UzoqsInmVaFd0XMMlELYDshbuxNPvP-yxtlCMlcsbmlWiixNl', // SSG 08 | Blood in the Water
    'MP9': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8js_f_jdk4uL3V6psMvOaHVicyOl-pK8xGXq2xE536m7dnI2vdS6WagZ2CMFyFrNcsBjuw4G1Ne23tQGN3olH02yg2ZxyeudA', // MP9 | Airlock
    'MAC-10': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8n5WxrR1Y-s2jaac8cM-dC2ie0-dytfNWQyC0nQlp5DzTntmgdC7COABxX5NxQrUOtUS5w4LgMu6zsVCK2IJCmyisjitM6DErvbicsEA0SQ', // MAC-10 | Neon Rider
    'Nova': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL_kYDhwiFO0PyhfqVSIf6HB3aFxNF6ueZhW2fmwRwl6jyHw96vIn2UbVVzXMdyRuYLt0O7ltPjZbu0tQTejo9Hyn2skGoXucYtjcOH', // Nova | Antique
    'XM1014': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLpk8ewrHZk7OeRcKk8cKHHMWad1OJzpN5rQzy2qhEutDWR1N-hI3yWbVRyD8YiEOVZ50TqmoKyZb7rtVfWgosQzX7-3X9K5yc4tr4cEf1yVvkijss', // Souvenir XM1014 | Entombed
    'Bayonet': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKni_DtU4fe6Jv07IfTDDT_JkL4htLI7HCvmwE9z42_Vzov4ci2Wa1IgWMN3R7IMuxCm0oqwYUAZNBA', // ★ Bayonet
    'Bowie Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s29fbZ7KeaSAliSzvl_ta88TX61xExyt2nTz9eveHjEPQRzXMcjFuYIuhHtkIKyNLnmtACLg4sX02yg2XbF4Kcv', // ★ Bowie Knife
    'Butterfly Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2sfbB5JeKVAn7elO8l6LRoF3_hzBsmtWSDzt-rcy3BP1AnXsR4FOJZskG6xtDkM7627xue1dy94mNpNQ', // ★ Butterfly Knife
    'Classic Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2te7cjd6HHXmHBxep157VtTi_rzUR-5WiHnt39c3_EZg4pW5UjQOZbsBCxw8qnab32FBG7RA', // ★ Classic Knife
    'Falchion Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2oaahuKPmcACmSlL4u5uVqG37klhh24DnUytaqJXKQbgcmX5RyF-4Puha8xofmZejg-UWA3FLkEz9H', // ★ Falchion Knife
    'Flip Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2oZK19bqjKVjbDkbtwtbU4S3jhwElw4DvVzomhd3_CblV1CZd2TO5f4RG4lID5d7S15Y9TpQQ', // ★ Flip Knife
    'Gut Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2pfbAjd6TAXDSSkeh3trdtTCy1zUV2t2vTyoyrIHzDalAgCsN1ROcO40O6wMqnab0rKy1qHw', // ★ Gut Knife
    'Huntsman Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s26aad5KfOSAimVlugu47U5HSrmzEp14zncz4ygICiealIiAsF2EOdYtkTpwNXuYbjk-UWA3JpY_ZDP', // ★ Huntsman Knife
    'Karambit': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2labZsLfKaGinEx-0u5LhqGHrjlElz52jRmN2sd3yfb1NzWZVwRbNeu0S5k9WxMuvh-UWA3ObnwJvj', // ★ Karambit
    'Kukri Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2lfa9_Kb6VXmPGwuogsbNvSyi3zR4jsTnQztyqdS6QP1IoXpoiEeAC5Be5l9CxKaq8sIvgdE5J', // ★ Kukri Knife
    'M9 Bayonet': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2jMZtvIemcAGKEj7ojtOIwSnrrkEt25WiEw438cXuUaQB0WcBxFrUItxa6lNezMOKzsVPAy9USYWigJ8Q', // ★ M9 Bayonet
    'Navaja Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2pcbR-Oc-ZD2SbyuB_tuQnGXu1kBxw62_dwtird3qXZwQgXJV0E-4PtESxl4ezYr6x4FaMjI4UyzK-0H1iy36efQ', // ★ Navaja Knife
    'Nomad Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2hfbBpL_-BQDPEw-hz57cxTnCxkEh_5jnVzor8dymXbgAiAsFyEOEMsBW8l9O1Ne38p1uJmh0Kkm0', // ★ Nomad Knife
    'Paracord Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2tZ7ZpbqWRXmWTmbsm5bU5TXu3lkR_5j_Swor8JC_BPFVxWJd1FuID4RW7w9b5d7S1z-U4Rao', // ★ Paracord Knife
    'Shadow Daggers': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2-fbdlbvXKWWXIlbh15bdrTnvmwkt34z_Qz46hdnjFbAIkCJdzR-Zctxi5kNb5d7S1mgn3amY', // ★ Shadow Daggers
    'Skeleton Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s29Y6FhJeScACnDkL8j6LU8GS3mwUh24G-Bno2tIymeblMgC5R3F-ECsBK6k4XuN-Lh-UWA3P3GyEv9', // ★ Skeleton Knife
    'Stiletto Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s29fK1hJeSHASnCmO8v4bc_HCjilkkismTWyNutciqealMhDsR5F7MM4UWwlYC1Zr7n-UWA3E6ZCYCt', // ★ StatTrak™ Stiletto Knife
    'Survival Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s2taapkM77CDzbIlrsms-NsHHGxzUwj5G6En4yuIy_BbQAjC5VxQLRc5hm8x4HvKaq8sEukLuHu', // ★ StatTrak™ Survival Knife
    'Talon Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s25YaBiN_2SBWKCj7ghsrRrTHDnzB8h4mTRw9iudC_DPFVyCsF3R-Zc4xK_ldXgNb7qsgDAy9USS1NPX9M', // ★ StatTrak™ Talon Knife
    'Ursus Knife': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XuWbwcuyMESA4Fdl-4nnpU7iQA3-kKnr8ytd6s27erd4M77AXWWWx7h3tOA5SyvilEkj5WuGw42qc3zEOg4iDJEjQu9b4xa6w4DgKaq8sDVgNcPY', // ★ StatTrak™ Ursus Knife
    'Bloodhound Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tg_13jRBnOnJrv8iZT4OegbJtqLP-FC3Svw-J5v-VhQDy9kSIqtimEloPwIhTLN1F4Tox2Q7UJ4RLrltDkMuyz4ASIg4kUxCr5jy8fvC46sLtWWaojqKze2giTL_Rjtvi23tdj', // ★ Bloodhound Gloves | Bronzed
    'Broken Fang Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tg_13jRBnOnITv9idV6fOgb5tqLP-FC3Svzv5zouB9Ria9xE0YvjiRm4PwIhTALFN1VP0sHLBS9g65w9exM-Pl5gaKidkRziX22yNIv306571QA6pwrKGDiluTZLxs5ZdXOr_5GlzOqAIa', // ★ Broken Fang Gloves | Jade
    'Driver Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5T441rsfhr9kYDl7h1I4_utY5t-NPmHDW-VxdF0vOBqRBaknRQztgKJk4jxNWXBbwdxDcZwFrFY40XrktLgNr7q4AKM2owQmX6ojSpMuCo_tulQB6ss5OSJ2E_SKQx-', // ★ Driver Gloves | Black Tie
    'Hand Wraps': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu4vx603vRA_Olpfu-TVJ7uK9V6xsLvSEHGaA_uJzsfVhSjuqqhsmsS-MmbD7LT7CAUV7T84sBohW60fg1srnZb6zsw2Ng41MmST43C1L7is9574CBKIh_q2Big_IMOdutcNRd_iuU13QD7PQAmaY', // ★ Hand Wraps | Cobalt Skulls
    'Hydra Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tg_13jRBnOlo_k7yNk6P6hfqF-H_KfAWiUyeFjvuVWRzC3hxwYsDyWn7DxIDnDO1h1Xv0sHLBS9g7ul9zmMbi35FHYgolMmSj9jS8fvC5jte9RAqctqKCC2QHBYrU64MMCOr_5GlPhveuZ', // ★ Hydra Gloves | Case Hardened
    'Moto Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu4r7_lb1QgTykpPf-i5U-fe9V6liNP-BDX6TzetJs-5kQii9kRIYuC6OpYPwJiPTcAZyDMd2F-YIu0a4ktTjP--35Vfb3oMTyy_-iCtM7Hpq5elTBaYirKTJz1aWk_tQEIo', // ★ Moto Gloves | 3rd Commando Company
    'Specialist Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk71ruQBH4jYLf-i5U-fe9V6NhL-aWMXSAxO1_se1gXD2MghwxtgKHlpr8HifOOV5kFJJyFOVZuhC8l9XjNL-3tgHcg41HzHr4hntBuntpse0LUvZwr_bX3QjfcepqIIhMOUI', // ★ Specialist Gloves | Big Swell
    'Sport Gloves': 'i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Tk5UvzWCL2kpn2-DFk_OKherB0H-CcB3Sfz9Fwou5ucCu_gBgYpDWMjorGLSLANkI-W5R4E7JZtxbskNWxZeLi4QPejdgTmSn62iwbvyw957kDAqog_fXWjBaBb-Pahe96zA', // ★ Sport Gloves | Amphibious
  } as const;

export const CATALOG_MODEL_PREVIEW_SIZE_PX = 96;

export function getCatalogModelPreviewHash(weapon?: string | null): string | null {
  if (!weapon) {
    return null;
  }
  return CATALOG_MODEL_PREVIEW_ICON_HASHES[weapon] ?? null;
}

export function listCatalogModelPreviewHashes(weapons: readonly string[]): string[] {
  const hashes: string[] = [];
  for (const weapon of weapons) {
    const hash = getCatalogModelPreviewHash(weapon);
    if (hash) {
      hashes.push(hash);
    }
  }
  return hashes;
}


// {
//     create: (order) => {
//         // save order to database
//         // with status as unapproved
//     },
//     approve: (orderId, adminCredentails) => {
//         // save approve status along with details of the Admin
//         // API Calls -> InvoiceModel.createFromOrder
//     },

import AgentEarningModel from "./AgentEarningModel"
import Product from "../mongooseModel/Product"
import Organization from "../mongooseModel/Organization"
import Payment from "../mongooseModel/Payment"
import User from "../mongooseModel/User"
import InvoiceModel from "./InvoiceModel"
import Catalogue from "../mongooseModel/Catalogue"
import ShipRocketModel from "./ShipRocketModel"

// }
export default {
    createPayment: async (data) => {
        console.log("🚀 ~ file: PaymentModel.js:23 ~ createPayment: ~ data", data)
        let savePaymentObj = {},
            price = 0,
            orignalPrice = 0,
            discount = 0,
            grossTotal = 0,
            totalShippingCharges = 0,
            totalGst = 0,
            sdPercentage
        savePaymentObj = {
            buyerId: data.buyerId,
            buyerShippingAddress: data.buyerShippingAddress,
            buyerBillingAddress: data.buyerBillingAddress
        }
        let buyer = await User.findOne(
            { _id: data.buyerId },
            { _id: 1, name: 1 }
        )
        let buyerOrg = await Organization.findOne(
            { _id: data.organization },
            { shippingAddress: 1 }
        )
        savePaymentObj["buyerShippingAddress"] = buyerOrg.shippingAddress[0]
        let buyerWareHouseDetails = {
            warehouseId: buyerOrg.shippingAddress[0].warehouseId,
            name: buyerOrg.shippingAddress[0].name,
            email: buyerOrg.shippingAddress[0].email,
            phone: buyerOrg.shippingAddress[0].mobileNo
        }
        let dualObject = await PaymentModel.createPaymentProductObject(
            data,
            buyer,
            buyerWareHouseDetails
        )
        savePaymentObj["singleProduct"] = dualObject.singleProducts
        console.log("🚀 ~ file: PaymentModel.js:57 ~ createPayment: ~ dualObject.singleProducts", dualObject.singleProducts)
        savePaymentObj["catalogueProduct"] = dualObject.catalogueProducts
        console.log("🚀 ~ file: PaymentModel.js:59 ~ createPayment: ~ dualObject.catalogueProducts", dualObject.catalogueProducts)

        savePaymentObj["singleProduct"].map((singleProduct) => {
            price = price + singleProduct.price
            discount = discount + singleProduct.discount
            orignalPrice = orignalPrice + singleProduct.orignalPrice
            totalShippingCharges =
                totalShippingCharges + singleProduct.totalShippingCharges
            totalGst = totalGst + singleProduct.totalGst
            grossTotal =
                grossTotal +
                singleProduct.price +
                singleProduct.totalGst +
                singleProduct.totalShippingCharges
        })
        savePaymentObj["catalogueProduct"].map((catalogueProduct) => {
            price = price + catalogueProduct.price
            discount = discount + catalogueProduct.discount
            orignalPrice = orignalPrice + catalogueProduct.orignalPrice
            totalShippingCharges =
                totalShippingCharges + catalogueProduct.totalShippingCharges
            totalGst = totalGst + catalogueProduct.totalGst
            sdPercentage = catalogueProduct.discount
            grossTotal =
                grossTotal +
                catalogueProduct.price +
                catalogueProduct.totalGst +
                catalogueProduct.totalShippingCharges
        })
        savePaymentObj["price"] = _.round(price, 2)
        savePaymentObj["orignalPrice"] = _.round(orignalPrice, 2)
        savePaymentObj["grossTotal"] = _.round(grossTotal, 2)
        savePaymentObj["totalShippingCharges"] = _.round(
            totalShippingCharges,
            2
        )
        savePaymentObj["totalGst"] = _.round(totalGst, 2)

        // savePaymentObj["transactionStatus"] = "PaymentSuccess" // manually setting the status to PaymentSuccess

        savePaymentObj["buyerOrganizationId"] = data.organization
        console.log("🚀 ~ file: PaymentModel.js:95 ~ createPayment: ~ data.organization", data)

        let savings = 0
        if (orignalPrice - price > 0) {
            savings = orignalPrice - price
            savePaymentObj["savings"] = _.round(savings, 2)
        }

        //data.productsToBuy[0].product.discount
        
        savePaymentObj["discount"] = discount

        let outputData = await PaymentModel.savePayment(
            savePaymentObj,
            data.type,
            savings,
            "newPayment",
            discount,
        )
        if (outputData && outputData._id) {
            OrganizationModel.blastSocketBySocketName({
                socketName: `tabCount_${data.organization}`,
                query: {}
            })
        }

        return outputData
    },
    async createPaymentProductObject(data, buyerData, buyerWareHouseDetails) {
        let singleProducts = [],
            catalogueProducts = [],
            shippingDetails = {
                fromWarehouseId: buyerWareHouseDetails.warehouseId,
                senderName: buyerWareHouseDetails.name,
                senderEmail: buyerWareHouseDetails.email,
                senderContact: buyerWareHouseDetails.phone
            }
        await Promise.all(
            data.productsToBuy.map(async (singleProduct) => {
                if (singleProduct.productId) {
                    let pushObject = await PaymentModel.getSinglePushObject(
                        singleProduct,
                        buyerData
                    )
                    pushObject.shippingDetails = {
                        ...shippingDetails,
                        ...pushObject.shippingDetails
                    }
                    singleProducts.push(pushObject)
                } else {
                    let pushObject = await PaymentModel.getCataloguePushObject(
                        singleProduct,
                        buyerData
                    )
                    pushObject.shippingDetails = {
                        ...shippingDetails,
                        ...pushObject.shippingDetails
                    }
                    catalogueProducts.push(pushObject)
                }
            })
        )
        return { singleProducts, catalogueProducts }
    },
    async getSinglePushObject(data, buyerData) {
        console.log("🚀 ~ file: PaymentModel.js:163 ~ getSinglePushObject ~ data", data)
        // let orderId = global.voucher_codes.generate({
        //     prefix: "SD",
        //     length: 4,
        //     charset: "0123456789"
        // })[0]
        let sizes = []
        // checking for sizes and pushing
        if (data.scenario && data.scenario == "sellAll") {
            if (data.size && data.size.length) {
                data.size.forEach((size) => {
                    sizes.push({
                        size: size.name,
                        selected: size.selected,
                        ignoreSize: size.ignoreSize,
                        order: size.order,
                        returned: false
                    })
                })
            }
        } else if (data.scenario && data.scenario == "ignoreSize") {
            let ignoreSelected = await MyCartModel.getIgnoreSize(
                data.product.size
            )
            let unSelected = await MyCartModel.getUnSelectedSize(data.size)
            if (unSelected.length > ignoreSelected) {
                throw "You Can Ignore Less Than 2 Products"
            }
            if (data.size && data.size.length) {
                data.size.forEach((size) => {
                    sizes.push({
                        size: size.name,
                        selected: size.selected,
                        ignoreSize: size.ignoreSize,
                        order: size.order,
                        returned: false
                    })
                })
            }
        }
        var totalAmounts = await PaymentModel.calculateProductCalculations([
            data
        ])
        let Category = await Product.findOne({
            _id: ObjectId(data.productId)
        }).populate("mainCategory category subCategory")
        let agent = Category.prefferredAgent ? Category.prefferredAgent : ""
        let prefferredAgent
        if (agent) {
            prefferredAgent = await Organization.findOne({
                "user.userId": ObjectId(agent)
            })
        }
        prefferredAgent = prefferredAgent ? prefferredAgent._id : ""
        let mainCategory = {
            mainCategoryId: Category.mainCategory._id,
            name: Category.mainCategory.name
        }
        let category = {
            categoryId: Category.category._id,
            name: Category.category.name
        }
        let subCategory
        if (Category && Category.subCategory && Category.subCategory._id) {
            subCategory = {
                subCategoryId: Category.subCategory._id,
                name: Category.subCategory.name
            }
        }
        let warehouseId = data.product.organization.shippingAddress[0]
            .warehouseId
            ? data.product.organization.shippingAddress[0].warehouseId
            : ""
        let shippingDetails = {
            toWarehouseId: warehouseId,
            recipientName: data.product.organization.shippingAddress[0].name,
            recipientEmail: data.product.organization.shippingAddress[0].email,
            recipientContact:
                data.product.organization.shippingAddress[0].mobileNo,
            totalShippingCharges:
                data.shippingCharges && data.shippingCharges.shippingCharge
                    ? data.shippingCharges.shippingCharge
                    : 900,
            modeId:
                data.shippingCharges && data.shippingCharges.modeId
                    ? data.shippingCharges.modeId
                    : "AIR",
            deliveryPartnerId:
                data.shippingCharges && data.shippingCharges.deliveryPartnerId
                    ? data.shippingCharges.deliveryPartnerId
                    : "DIPASDH",
            packageDetails:
                data.shippingDetails &&
                data.shippingDetails.packaging_unit_details
                    ? data.shippingDetails.packaging_unit_details
                    : {}
        }
        var objectToPush = {
            productId: data.productId,
            sellerId: data.sellerId,
            organizationId: data.organizationId,
            quantity: data.quantity,
            size: sizes,
            gst: data.gst,
            discount: data.discount,
            sdPercentage: data.chargesOfSuratDreams,
            price: totalAmounts.totalAmount,
            orignalPrice: totalAmounts.totalAmount,
            grossTotal: totalAmounts.totalAmount + totalAmounts.totalGst,
            totalShippingCharges:
                data.shippingCharges && data.shippingCharges.shippingCharge
                    ? data.shippingCharges.shippingCharge
                    : 900,
            totalGst: totalAmounts.totalGst,
            totalWeight: totalAmounts.totalWeight,
            // orderId: orderId,
            shippingDetails: shippingDetails,
            mainCategory: mainCategory,
            category: category,
            subCategory: subCategory,
            scenario: data.scenario,
            discount: data.product.discount,
            sellerShippingAddress: data.product.organization.shippingAddress,
            sellerBillingAddress: data.product.organization.billingAddress, //a bit of haywired plese check when free?
            logs: [
                {
                    fromStatus: "Null",
                    toStatus: "Pending",
                    date: new Date(),
                    user: buyerData._id,
                    name: buyerData.name
                }
            ]
        }
        if (prefferredAgent) {
            objectToPush.agentId = ObjectId(prefferredAgent)
        }
        if (totalAmounts.totalDiscountedPrice != 0) {
            objectToPush["price"] = totalAmounts.totalDiscountedPrice
            objectToPush["grossTotal"] =
                totalAmounts.totalDiscountedPrice + totalAmounts.totalGst
        }
        if (data.agentId) {
            let agentOutputData =
                await AgentEarningModel.createEarningPerProduct({
                    user: data.agentId,
                    productId: data.productId,
                    price: objectToPush.price
                })
            if (
                agentOutputData &&
                agentOutputData.status &&
                agentOutputData.status == 200
            ) {
                objectToPush["agentEarning"] = agentOutputData.body._id
                objeectToPush["agentId"] = data.agentId
            }
        }
        return objectToPush
    },
    async getCataloguePushObject(data, buyerData) {
        // let orderId = global.voucher_codes.generate({
        //     prefix: "SD",
        //     length: 4,
        //     charset: "0123456789"
        // })[0]
        let products = []
        let discount = 0
        let [organizationData, catalogueData] = await Promise.all([
            Organization.findById({ _id: ObjectId(data.organizationId) }),
            Catalogue.findById({ _id: ObjectId(data.catalogueId) })
        ])
        discount = catalogueData.discount
        if (data.scenario && data.scenario == "sellAll") {
            data.productSelected.map((productObj) => {
                let Sizes = []
                productObj.size.map((size) => {
                    size.returned = false
                    Sizes.push(size)
                })
                products.push({
                    productId: productObj._id,
                    size: Sizes,
                    price: productObj.pricePerPiece,
                    selected: true
                })
            })
        } else if (data.scenario && data.scenario == "ignoreDesign") {
            _.forEach(data.productSelected, (productObj) => {
                let sizes = []
                productObj.size.map((size) => {
                    size.returned = false
                    sizes.push(size)
                })
                products.push({
                    productId: productObj._id,
                    size: sizes,
                    price: productObj.pricePerPiece,
                    selected: productObj.selected
                })
            })
        } else {
            data.productSelected.map((productObj) => {
                let productSizes = []
                if (!_.isEmpty(productObj.size)) {
                    productObj.size.map((sizeObj) => {
                        sizeObj.returned = false
                        productSizes.push(sizeObj)
                    })
                    products.push({
                        productId: productObj._id,
                        size: productSizes,
                        selected: productObj.selected,
                        price: productObj.pricePerPiece
                    })
                }
            })
        }
        var totalAmounts = await PaymentModel.calculateProductCalculations([
            data
        ])
        let Category = await Catalogue.findOne({
            _id: ObjectId(data.catalogueId)
        }).populate("mainCategory category subCategory")
        let agent = Category.prefferredAgent ? Category.prefferredAgent : ""
        let prefferredAgent
        if (agent) {
            prefferredAgent = await Organization.findOne({
                "user.userId": ObjectId(agent)
            })
        }
        prefferredAgent =
            prefferredAgent && prefferredAgent._id ? prefferredAgent._id : ""
        let mainCategory = {
            mainCategoryId: Category.mainCategory._id,
            name: Category.mainCategory.name
        }
        let category = {
            categoryId: Category.category._id,
            name: Category.category.name
        }
        let subCategory = {}
        if (Category && Category.subCategory && Category.subCategory._id) {
            subCategory = {
                subCategoryId: Category.subCategory._id,
                name: Category.subCategory.name
            }
        }
        let warehouseId = organizationData.shippingAddress[0].warehouseId
            ? organizationData.shippingAddress[0].warehouseId
            : ""
        let shippingDetails = {
            toWarehouseId: warehouseId,
            recipientName: organizationData.shippingAddress[0].name,
            recipientEmail: organizationData.shippingAddress[0].email,
            recipientContact: organizationData.shippingAddress[0].mobileNo,
            totalShippingCharges:
                data.shippingCharges && data.shippingCharges.shippingCharge
                    ? data.shippingCharges.shippingCharge
                    : 900,
            modeId:
                data.shippingCharges && data.shippingCharges.modeId
                    ? data.shippingCharges.modeId
                    : "AIR",
            deliveryPartnerId:
                data.shippingCharges && data.shippingCharges.deliveryPartnerId
                    ? data.shippingCharges.deliveryPartnerId
                    : "LAJSBJDHVASDKN",
            packageDetails:
                data.shippingDetails &&
                data.shippingDetails.packaging_unit_details
                    ? data.shippingDetails.packaging_unit_details
                    : {}
        }
        let objectToPush = {
            price: totalAmounts.totalAmount,
            orignalPrice: totalAmounts.totalAmount,
            grossTotal: totalAmounts.totalAmount + totalAmounts.totalGst,
            totalShippingCharges:
                data.shippingCharges && data.shippingCharges.shippingCharge
                    ? data.shippingCharges.shippingCharge
                    : "690",
            shippingDetails: shippingDetails,
            totalGst: totalAmounts.totalGst,
            gst: data.gst,
            discount: discount,
            totalWeight: totalAmounts.totalWeight,
            catalogueId: data.catalogueId,
            organizationId: data.organizationId,
            quantity: data.quantity,
            products: products,
            sdPercentage: data.chargesOfSuratDreams,
            sellerId: data.sellerId,
            // orderId: orderId,
            mainCategory: mainCategory,
            category: category,
            subCategory: subCategory,
            scenario: data.scenario,
            sellerShippingAddress: organizationData.shippingAddress,
            sellerBillingAddress: organizationData.billingAddress,
            logs: [
                {
                    fromStatus: "Null",
                    toStatus: "Pending",
                    date: new Date(),
                    user: buyerData._id,
                    name: buyerData.name
                }
            ]
        }
        if (prefferredAgent) {
            objectToPush.agentId = ObjectId(prefferredAgent)
        }
        if (totalAmounts.totalDiscountedPrice != 0) {
            objectToPush["price"] = totalAmounts.totalDiscountedPrice
            objectToPush["grossTotal"] =
                totalAmounts.totalDiscountedPrice + totalAmounts.totalGst
        }
        if (data.agentId) {
            let agentOutputData =
                await AgentEarningModel.createEarningPerProduct({
                    user: data.agentId,
                    productId: data.productId,
                    price: objectToPush.price
                })
            if (
                agentOutputData &&
                agentOutputData.status &&
                agentOutputData.status == 200
            ) {
                objectToPush["agentEarning"] = agentOutputData.body._id
                objeectToPush["agentId"] = data.agentId
            }
        }
        return objectToPush
    },
    async PaymentBuyNow(data) {
        console.log("PaymentBuyNow", data)
        let productTotals = await PaymentModel.calculateProductCalculations([
            data
        ])
        console.log("productTotals", productTotals)
        let savePaymentObj = {},
            singleProduct = [],
            catalogueProduct = [],
            products = [],
            sizes = []
        if (data.productId) {
            // if (data.sellScenario) {
            //     if (data.sellScenario == "ignoreSize") {
            //         if (data.size && data.size.length) {
            //             data.size.forEach(async (singleSize) => {
            //                 if (singleSize.selected) {
            //                     sizes.push(singleSize)
            //                 }
            //             })
            //         }
            //     } else {
            //         if (data.size && data.size.length) {
            //             data.size.forEach(async (singleSize) => {
            //                 sizes.push(singleSize)
            //             })
            //         }
            //     }
            // }
            if (data.prefferredAgent) {
                singleProduct["agentId"] = data.prefferredAgent
            }
            singleProduct.push({
                productId: data.productId,
                sellerId: data.sellerId,
                organizationId: data.organizationId,
                quantity: data.quantity,
                size: sizes,
                gst: data.gst,
                sdPercentage: data.chargesOfSuratDreams
            })
            savePaymentObj = {
                buyerId: data.buyerId,
                singleProduct: singleProduct
            }
        } else {
            // if (data.sellScenario && data.sellScenario == "ignoreDesign") {
            //     if (data.size && data.size.length) {
            //         data.size.forEach(async (singleSize) => {
            //             sizes.push(singleSize)
            //         })
            //     }
            // }
            if (data.prefferredAgent) {
                catalogueProduct["agentId"] = data.prefferredAgent
            }
            catalogueProduct.push({
                catalogueId: data.catalogueId,
                sellerId: data.sellerId,
                organizationId: data.organizationId,
                quantity: data.quantity,
                products: data.products,
                gst: data.gst,
                sdPercentage: data.chargesOfSuratDreams
            })
            savePaymentObj = {
                buyerId: data.buyerId,
                catalogueProduct: catalogueProduct
            }
        }
        console.log("savePaymentObj", savePaymentObj)
        return await PaymentModel.savePayment(savePaymentObj, data.type)
    },
    // async calculationsForBuyNow(data) {
    //     console.log("calculationsForBuyNow", data)
    //     let totalAmounts = await PaymentModel.calculateProductCalculations([data])
    //     console.log("total amounts buy now", totalAmounts)
    //     let objectToPush = {
    //         price: totalAmounts.totalAmount,
    //         orignalPrice: totalAmounts.totalAmount,
    //         grossTotal:
    //             totalAmounts.totalAmount +
    //             totalAmounts.totalShippingCharges +
    //             totalAmounts.totalGst,
    //         totalShippingCharges: totalAmounts.totalShippingCharges,
    //         totalGst: totalAmounts.totalGst,
    //         gst: data.gst,
    //         totalWeight: totalAmounts.totalWeight,
    //     }
    //     if (totalAmounts.totalDiscountedPrice != 0) {
    //         objectToPush["price"] = totalAmounts.totalDiscountedPrice
    //         objectToPush["grossTotal"] =
    //             totalAmounts.totalDiscountedPrice +
    //             totalAmounts.totalShippingCharges +
    //             totalAmounts.totalGst
    //     }
    //     return objectToPush
    // },
    savePayment: async (dataToSave, dataToDelete, savings, isNewPayment, discount ) => {
        let newPayment = new Payment(dataToSave)
        if (isNewPayment) {
            let razorPayData = {
                amount: parseInt(dataToSave.grossTotal * 100),
                currency: "INR",
                receipt: newPayment._id.toString()
            }
            // let razorPayOrder = await RazorPayModel.createOrder(razorPayData)
            // if (razorPayOrder) {
            //     newPayment.razorPayOrderId = razorPayOrder.id
            // }
            newPayment.razorPayOrderId = "9812to3guhkbdo18y3egckcnjb eiy2dtv2"
        }
        let savePayment = await newPayment.save()
        if (savePayment && !_.isEmpty(savePayment)) {
            let combinedArray = savePayment.singleProduct.concat(
                savePayment.catalogueProduct
            )
            let orderIdArray = []
            combinedArray.forEach((singleObj) => {
                OrganizationModel.blastSocketBySocketName({
                    socketName: `tabCount_${singleObj.organizationId}`,
                    query: {}
                })
                orderIdArray.push({
                    orderId: singleObj.orderId
                })
            })
            await MyCartModel.deleteCart({
                buyerId: ObjectId(dataToSave.buyerId),
                type: dataToDelete
            })
            console.log("savepayment data", savePayment)
            if (
                (savePayment.catalogueProduct &&
                    savePayment.catalogueProduct[0] &&
                    savePayment.catalogueProduct[0].orderStatus &&
                    savePayment.catalogueProduct[0].orderStatus ==
                        "ReturnPending") ||
                (savePayment.singleProduct &&
                    savePayment.singleProduct[0] &&
                    savePayment.singleProduct[0].orderStatus &&
                    savePayment.singleProduct[0].orderStatus == "ReturnPending")
            ) {
                // emailer if order is return pending
                console.log("not mailing")
            }
            // else {
            //     PaymentModel.mailManufacturers(savePayment)
            //     PaymentModel.mailBuyer(savePayment)
            // }
            return {
                orderIds: orderIdArray,
                razorPayOrderId: savePayment.razorPayOrderId,
                savings: _.round(savings, 2),
                discount: discount,
                _id: savePayment._id
            }
        } else {
            return "Failed To Save Product"
        }
    },
    async mailBuyer(data) {
        let products = []
        let subject = "Your Order Has Been Placed"
        let buyerData = await Organization.findOne({
            "user.userId": data.buyerId
        })
        if (data.singleProduct && !_.isEmpty(data.singleProduct)) {
            data.singleProduct.forEach((singleProduct) => {
                products.push(singleProduct)
            })
        }
        if (data.catalogueProduct && !_.isEmpty(data.catalogueProduct)) {
            data.catalogueProduct.forEach((catalogueProduct) => {
                products.push(catalogueProduct)
            })
        }
        let { finalProducts } = await PaymentModel.preData(products)
        PaymentModel.buyerMailer({
            subject: subject,
            products: finalProducts,
            email: buyerData.email,
            totalOrder: finalProducts.length ? finalProducts.length : 1,
            gstq: finalProducts[0].gstp,
            gst: _.round(data.totalGst, 2),
            shippingCharges: _.round(data.totalShippingCharges, 2),
            totalAmount: _.round(data.price, 2),
            paidTotal: _.round(data.grossTotal, 2)
        })
    },
    preData: async (products) => {
        let finalProducts = []
        let price = 0,
            gst = 0,
            shippingCharges = 0,
            totalAmount = 0
        for (let singleProduct of products) {
            if (singleProduct.productId) {
                let productData = await Product.findOne({
                    _id: singleProduct.productId
                }).populate("mainCategory organization")
                console.log("productData temp", productData)
                if (productData && !_.isEmpty(productData)) {
                    let product = {
                        name: productData.name,
                        organizationName: productData.organization.companyName,
                        city: productData.organization.city,
                        mainCategory: productData.mainCategory.name,
                        displayImage: productData.displayImage[0].image,
                        gstp: singleProduct.gst,
                        gst: _.round(singleProduct.totalGst, 2),
                        price: _.round(singleProduct.price, 2),
                        shippingCharges: _.round(
                            singleProduct.totalShippingCharges,
                            2
                        ),
                        email: productData.organization.email
                    }
                    finalProducts.push(product)
                }
            } else {
                let productData = await Catalogue.findOne({
                    _id: singleProduct.catalogueId
                }).populate("mainCategory organization")
                if (productData && !_.isEmpty(productData)) {
                    let product = {
                        name: productData.name,
                        organizationName: productData.organization.companyName,
                        city: productData.organization.city,
                        mainCategory: productData.mainCategory.name,
                        displayImage: productData.catalogueImage,
                        gstp: singleProduct.gst,
                        gst: singleProduct.totalGst,
                        price: singleProduct.price,
                        shippingCharges: singleProduct.totalShippingCharges
                    }
                    finalProducts.push(product)
                }
            }
            gst = gst + singleProduct.totalGst
            shippingCharges =
                shippingCharges + singleProduct.totalShippingCharges
            price = price + singleProduct.price
        }
        totalAmount = price + shippingCharges + gst
        return { finalProducts, price, gst, shippingCharges, totalAmount }
    },
    async buyerMailer(data) {
        console.log("DATA", data)
        try {
            let subject = data.subject
            let emails = await ejs.renderFile("./views" + "/final-order.ejs", {
                url: imageUrl,
                subject: data.subject,
                products: data.products,
                email: data.email,
                totalOrder: data.totalOrder,
                gstq: data.gstq,
                gst: data.gst,
                shippingCharges: data.shippingCharges,
                orderAmount: data.totalAmount,
                paidTotal: data.paidTotal,
                displayImage: data.displayImage
            })
            let outputData = await UserModel.sendEmail({
                email: data.email,
                ejsFile: emails,
                subject: subject
            })
            return outputData
        } catch (error) {
            console.log("recent error", error)
            return "Failed to "
        }
    },
    // sort the data by organization and send data for mail
    mailManufacturers: async (data) => {
        let products = []
        let subject = "Products Added By Buyer"
        let buyerData = await Organization.findOne({
            "user.userId": data.buyerId
        }).populate("user.userId")
        console.log("buyer data", buyerData.shippingAddress[0])
        if (data.singleProduct && !_.isEmpty(data.singleProduct)) {
            data.singleProduct.forEach((singleProduct) => {
                products.push(singleProduct)
            })
        }
        if (data.catalogueProduct && !_.isEmpty(data.catalogueProduct)) {
            data.catalogueProduct.forEach((catalogueProduct) => {
                products.push(catalogueProduct)
            })
        }
        let buyer = {
            buyerName: buyerData.shippingAddress[0].name,
            country: buyerData.shippingAddress[0].country,
            contact: buyerData.shippingAddress[0].mobileNo,
            state: buyerData.shippingAddress[0].state,
            email: buyerData.shippingAddress[0].email,
            city: buyerData.shippingAddress[0].city,
            address: buyerData.shippingAddress[0].address,
            zipcode: buyerData.shippingAddress[0].zipcode
        }
        let temp = []
        let allOrganization = _.map(products, (single) => {
            if (temp.includes(single.organizationId.toString())) {
                return single.organizationId
            } else {
                temp.push(single.organizationId.toString())
                return single.organizationId
            }
        })
        let organizationSort = _.groupBy(products, "organizationId")
        for (let oid of temp) {
            let tempOrg = organizationSort[oid]
            let { finalProducts, price, gst, shippingCharges, totalAmount } =
                await PaymentModel.preData(tempOrg)

            PaymentModel.manufacturerMailer({
                subject: subject,
                products: finalProducts,
                email: finalProducts[0].email,
                totalOrder: finalProducts.length ? finalProducts.length : 1,
                gstq: finalProducts[0].gstp,
                gst: _.round(gst, 2),
                shippingCharges: _.round(shippingCharges, 2),
                totalAmount: _.round(price, 2),
                paidTotal: _.round(totalAmount, 2),
                buyer: buyer
            })
        }
    },
    async manufacturerMailer(data) {
        try {
            let subject = data.subject
            let emails = await ejs.renderFile(
                "./views" + "/order-placed-by-buyer.ejs",
                {
                    url: imageUrl,
                    products: data.products,
                    totalOrder: data.totalOrder,
                    gstq: data.gatq,
                    orderAmount: data.totalAmount,
                    totalAmount: data.paidTotal,
                    gst: data.gst,
                    shippingCharges: data.shippingCharges,
                    buyer: data.buyer
                }
            )
            let outputData = await UserModel.sendEmail({
                email: data.email,
                ejsFile: emails,
                subject: subject
            })
            return outputData
        } catch (error) {
            console.log("recent error", error)
            return "Failed to "
        }
    },
    getOnePaymentOrderIds: async (data) => {
        try {
            let findOnePayment = await Payment.findOne({
                razorPayOrderId: data.paymentId
            })
            if (findOnePayment && !_.isEmpty(findOnePayment)) {
                let combinedArray = findOnePayment.singleProduct.concat(
                    findOnePayment.catalogueProduct
                )
                let orderIdArray = []
                combinedArray.forEach((singleObj) => {
                    orderIdArray.push({
                        orderId: singleObj.orderId
                    })
                })
                let savings = findOnePayment.savings
                    ? findOnePayment.savings
                    : 0
                return {
                    status: 200,
                    orderId: orderIdArray,
                    savings: savings,
                    message: "Success"
                }
            } else {
                return {
                    status: 404,
                    data: "No Order Found",
                    message: "Not Found"
                }
            }
        } catch (error) {
            return {
                status: 500,
                data: error,
                message: "Internal Server Error"
            }
        }
    },
    updateOnePayment: async (data) => {
        console.log("KKKKKKKKKKKK", data)
        if (!data.transactionStatus) {
            return "Please Provide Transaction Status"
        } else {
            if (data.transactionStatus == "Pending") {
                return "Please Provide Valid Transaction Status"
            } else if (
                data.transactionStatus == "Rejected" &&
                !data.rejectionReason
            ) {
                return "Please Provide Rejection Reason"
            }
        }
        let updatePayment = await Payment.updateOne(
            {
                _id: ObjectId(data.PaymentId)
            },
            data,
            {
                new: true
            }
        )
        console.log("updatePayment", updatePayment)
        if (updatePayment && updatePayment.nModified) {
            return "Payment Status Changed Successfully"
        } else {
            return "Something Went Wrong While Updating Payment"
        }
    },
    async approvedUnapprovedPaymentFromAdmin(data) {
        console.log("approvedUnapprovedPaymentFromAdmin", data)
        let findOnePayment = await Payment.findOne({
            _id: ObjectId(data.PaymentId)
        })
        console.log("findOnePayment", findOnePayment)
        if (!findOnePayment && _.isEmpty(findOnePayment)) {
            return "No Payment Found"
        }
        //  else if (findOnePayment.transactionStatus == "Pending") {
        //     return "Buyer is not pay the amount"
        // } else if (findOnePayment.transactionStatus == "Approved") {
        //     return "Payment status is Approved"
        // }
        let updatePayment = await PaymentModel.updateOnePayment(data)
        console.log("findOnePayment", findOnePayment, updatePayment)
        if (data.transactionStatus && !data.returnPaymentId) {
            console.log("inside if")
            return await InvoiceModel.createFromOrder(findOnePayment)
        }
        // else {
        //     console.log("KKKKKKKKKKKK")
        //     // let sendObj = {
        //     //     PaymentId: findOnePayment._id,
        //     //     buyerId: data.buyerId
        //     // }
        //     // if (findOnePayment.singleProduct.length) {
        //     //     sendObj["productId"] = findOnePayment.singleProduct[0].productId
        //     // } else {
        //     //     sendObj["catalogueId"] =
        //     //         findOnePayment.catalogueProduct[0].catalogueId
        //     // }
        //     return await InvoiceModel.returnInvoice(data)
        // }
    },
    async returnProduct(data) {
        let findOneObj = {},
            findOnePayment = {},
            findObj = {}
        if (data.productId) {
            findOneObj = {
                _id: ObjectId(data.orderId),
                "singleProduct.productId": ObjectId(data.productId),
                buyerId: ObjectId(data.buyerId)
            }
            findObj = [
                {
                    $match: {
                        "singleProduct.orderId": data.returnOrderId
                            ? data.returnOrderId
                            : ""
                    }
                },
                {
                    $project: {
                        singleProduct: {
                            $filter: {
                                input: "$singleProduct",
                                as: "singleProduct",
                                cond: {
                                    $eq: [
                                        "$$singleProduct.orderId",
                                        data.returnOrderId
                                            ? data.returnOrderId
                                            : ""
                                    ]
                                }
                            }
                        }
                    }
                }
            ]
        } else {
            findObj = [
                {
                    $match: {
                        "catalogueProduct.orderId": data.returnOrderId
                    }
                },
                {
                    $project: {
                        catalogueProduct: {
                            $filter: {
                                input: "$catalogueProduct",
                                as: "catalogueProduct",
                                cond: {
                                    $eq: [
                                        "$$catalogueProduct.orderId",
                                        data.returnOrderId
                                    ]
                                }
                            }
                        }
                    }
                }
            ]
        }
        findOnePayment = await Payment.findOne(findOneObj)
        console.log("findOnePayment", findOnePayment)
        if (!findOnePayment && _.isEmpty(findOnePayment)) {
            return "No Payment Found"
        }

        let returnData = await PaymentModel.calculateReturnPrice(
            data,
            findOnePayment
        )
        console.log("🚀 ~ file: PaymentModel.js:1030 ~ returnProduct ~ returnData", returnData)
       
        if (returnData.error) {
            return "Return Price Calculation Failed"
        } else {
            data.returnPrice = _.round(returnData.totalPrice, 2)
            data.totalGst = _.round(returnData.totalGst, 2)
        }
        console.log("return price is ", data.returnPrice)

        let onePayment = await Payment.aggregate(findObj)
        console.log("onePayment", JSON.stringify(onePayment))

        PaymentModel.updatePaymentToReturn(data)

        let savePaymentObj = PaymentModel.returnOrderSaveObject(
            data,
            onePayment[0]
        )
        if (
            onePayment &&
            onePayment.length &&
            onePayment[0].singleProduct &&
            onePayment[0].singleProduct.length &&
            onePayment[0].singleProduct[0]
        ) {
            savePaymentObj["orignalPrice"] = _.round(
                onePayment[0].singleProduct[0].price +
                    onePayment[0].singleProduct[0].totalGst,
                2
            )
        } else {
            savePaymentObj["orignalPrice"] = _.round(
                onePayment[0].catalogueProduct[0].price +
                    onePayment[0].catalogueProduct[0].totalGst,
                2
            )
        }
        let organization = await Organization.findOne({
            "user.userId": ObjectId(data.buyerId)
        })
        savePaymentObj["buyerOrganizationId"] = organization._id
        console.log("savePaymentObj", savePaymentObj)
        savePaymentObj["price"] = findOnePayment.price
        savePaymentObj["discount"] = returnData.discount
        console.log("🚀 ~ file: PaymentModel.js:1074 ~ returnProduct ~ returnData.discount", returnData.discount)

        if (savePaymentObj.error) {
            return savePaymentObj.error
        } else {
            return await PaymentModel.savePayment(savePaymentObj)
        }
    },
    async calculateReturnPrice(data, onePayment) {
        try {
            let totalPrice = 0,
                price = 0,
                discount = 0
            if (data.productId) {
                let productData = await Product.findById({
                    _id: ObjectId(data.productId)
                })
                if (!_.isEmpty(productData) && productData.discount) {
                    discount = productData.discount
                }
            } else {
                let catalogueData = await Catalogue.findById({
                    _id: ObjectId(data.catalogueId)
                })
                if (catalogueData && catalogueData.discount) {
                    discount = catalogueData.discount
                }
            }
            console.log("this is discount", discount)
            if (data.productId) {
                let returnSizes = []
                if (!_.isEmpty(data.size)) {
                    returnSizes = data.size.filter((sizeObj) => {
                        return sizeObj.returned
                    })
                    console.log("returnSizes", returnSizes)
                    price = data.price * returnSizes.length
                } else {
                    price = data.price
                }
            } else {
                let returnSizes = []
                _.forEach(data.products, (singleProduct) => {
                    if (
                        singleProduct.returnedProduct &&
                        singleProduct.selected
                    ) {
                        console.log("singleProduct ins", singleProduct)
                        if (!_.isEmpty(singleProduct.size)) {
                            returnSizes = singleProduct.size.filter(
                                (sizeObj) => {
                                    return sizeObj.returned
                                }
                            )
                            console.log("returnSizes", returnSizes)
                            price += singleProduct.price * returnSizes.length
                        } else {
                            price += singleProduct.price
                        }
                    }
                })
            }
            let gst = PaymentModel.calculateGst(price, data.gst)
            if (Number(data.returnedQuantity) >= 1) {
                totalPrice = (price + gst) * Number(data.returnedQuantity)
            } else {
                totalPrice = price + gst
            }
            if (+discount > 0) {
                totalPrice = totalPrice - (totalPrice * discount) / 100
            }
            return { totalPrice, totalGst: gst, discount }
        } catch (err) {
            console.log(err)
            return { error: err }
        }
    },
    async getDifference(data) {
        let { totalPrice } = await PaymentModel.calculateReturnPrice(data)
        let diff = data.totalAmount - totalPrice
        return { totalPrice, diff }
    },
    async updatePaymentToReturn(data) {
        let queryObj = {},
            updateObj = {},
            logs = {
                fromStatus: "Delivered",
                toStatus: "ReturnApplied",
                date: new Date(),
                user: ObjectId(data.buyerId),
                name: data.buyerShippingAddress.name
            },
            logObject = {}
        if (data.singleProductOrderId) {
            queryObj = {
                _id: ObjectId(data.orderId),
                "singleProduct._id": ObjectId(data.singleProductOrderId),
                buyerId: ObjectId(data.buyerId)
            }
            updateObj = {
                "singleProduct.$.orderStatus": "ReturnPending"
            }
            logObject["singleProduct.$.logs"] = logs
        } else {
            queryObj = {
                _id: ObjectId(data.orderId),
                "catalogueProduct._id": ObjectId(data.catalogueProductOrderId),
                buyerId: ObjectId(data.buyerId)
            }
            updateObj = {
                "catalogueProduct.$.orderStatus": "ReturnPending"
            }
            logObject["catalogueProduct.$.logs"] = logs
        }
        let updateOneData = await Payment.updateOne(
            queryObj,
            { $set: updateObj, $push: logObject },
            {
                new: true
            }
        )
        console.log("updateOneData updateOneData", updateOneData)
        if (!updateOneData.nModified) {
            return "Failed To Update Payment"
        }
    },
    returnOrderSaveObject(data, findOnePayment) {
        console.log("🚀 ~ file: PaymentModel.js:1202 ~ returnOrderSaveObject ~ findOnePayment", findOnePayment)
        console.log("🚀 ~ file: PaymentModel.js:1202 ~ returnOrderSaveObject ~ data", JSON.stringify(data) )
        
        try {
            let savePaymentObj = {},
                singleProduct = [],
                catalogueProduct = [],
                logs = [
                    {
                        fromStatus: "Delivered",
                        toStatus: "ReturnPending",
                        date: new Date(),
                        user: ObjectId(data.buyerId)
                    }
                ]

            if (data.productId) {
                console.log("DataReturn", findOnePayment.singleProduct[0].discount)
                singleProduct.push({
                    productId: data.productId,
                    sellerId: data.sellerId,
                    organizationId: data.organizationId,
                    quantity: data.quantity,
                    orderStatus: "ReturnPending",
                    size: data.size,
                    gst: data.gst,
                    sdPercentage: data.sdPercentage,
                    returnedQuantity: data.returnedQuantity,
                    orderId: data.returnOrderId,
                    price: data.price,
                    discount: findOnePayment.singleProduct[0].discount || 0 ,
                    grossTotal: data.returnPrice,
                    totalWeight: data.totalWeight,
                    returnedPrice: data.returnPrice,
                    logs: logs,
                    mainCategory: findOnePayment.singleProduct[0].mainCategory,
                    category: findOnePayment.singleProduct[0].category,
                    subCategory: findOnePayment.singleProduct[0].subCategory
                })
                savePaymentObj = {
                    buyerId: data.buyerId,
                    singleProduct: singleProduct,
                    transactionStatus: "ReturnPending",
                    returnPaymentId: findOnePayment._id,
                    returnOrderId: data.singleProductOrderId,
                    // courierCompanyName: data.courierCompanyName,
                    // trackingId: data.trackingId,
                    returnReason: data.returnedReason,
                    returnProductImage: data.returnProductImage,
                    buyerShippingAddress: data.buyerShippingAddress
                    // returnProductImage: data.returnProductImage
                }
            } else {
                catalogueProduct.push({
                    catalogueId: data.catalogueId,
                    orderStatus: "ReturnPending",
                    sellerId: data.sellerId,
                    organizationId: data.organizationId,
                    quantity: data.quantity,
                    products: data.products,
                    gst: data.gst,
                    sdPercentage:
                        findOnePayment.catalogueProduct[0].sdPercentage,
                    returnedQuantity: data.returnedQuantity,
                    orderId: data.returnOrderId,
                    returnedPrice: data.returnPrice,
                    scenario: data.scenario,
                    price: data.price,
                    discount: findOnePayment.catalogueProduct[0].discount || 0 ,
                    grossTotal: data.returnPrice,
                    logs: logs,
                    mainCategory:
                        findOnePayment.catalogueProduct[0].mainCategory,
                    category: findOnePayment.catalogueProduct[0].category,
                    subCategory: findOnePayment.catalogueProduct[0].subCategory
                })
                savePaymentObj = {
                    buyerId: data.buyerId,
                    catalogueProduct: catalogueProduct,
                    transactionStatus: "ReturnPending",
                    returnPaymentId: findOnePayment._id,
                    returnOrderId: data.catalogueProductOrderId,
                    // courierCompanyName: data.courierCompanyName,
                    // trackingId: data.trackingId,
                    returnedReason: data.returnedReason,
                    returnProductImage: data.returnProductImage,
                    buyerShippingAddress: data.buyerShippingAddress
                }
            }
            return savePaymentObj
        } catch (error) {
            return { error }
        }
    },
    async getAllOrderForBuyer(data) {
        try {
            let matchObject = await PaymentModel.buyerOrderMatchObject(data)
            matchObject.page = parseInt(data.page) > 1 ? parseInt(data.page) : 1
            matchObject.limit =
                parseInt(data.limit) > 0 ? parseInt(data.limit) : 10
            console.log("matchObject matchObject", matchObject)
            let pipeline = PaymentModel.buyerOrderPipiline(matchObject)
            console.log("🚀 ~ file: PaymentModel.js:1296 ~ getAllOrderForBuyer ~ pipeline", pipeline)
            console.log("pipeline pipeline", JSON.stringify(pipeline))
            let allPaymentData = await Payment.aggregate(pipeline)

            return {
                orderData:
                    allPaymentData &&
                    allPaymentData[0] &&
                    allPaymentData[0].allProducts
                        ? allPaymentData[0].allProducts
                        : [],
                totalCount:
                    allPaymentData &&
                    allPaymentData[0] &&
                    allPaymentData[0].totalCount &&
                    allPaymentData[0].totalCount[0] &&
                    allPaymentData[0].totalCount[0].count
                        ? allPaymentData[0].totalCount[0].count
                        : 0
            }
        } catch (error) {
            return {
                status: 500,
                error: error,
                message: "Internal Server Error"
            }
        }
    },
    buyerOrderMatchObject(data) {
        let matchObj = {
                buyerOrganizationId: ObjectId(data.organizationId)
            },
            orderStatues,
            fromStatues,
            logMatchObject = {},
            returnObject = {
                returnOrderId: {
                    $exists: false
                },
                returnPaymentId: {
                    $exists: false
                }
            }
        if (data.orderStatus == "Returned") {
            orderStatues = [
                "Approved",
                "Rejected",
                "ReturnPending",
                "ReturnShipping",
                "ReturnDelivered",
                "Unapproved"
            ]
            fromStatues = [
                "Delivered",
                "Approved",
                "Rejected",
                "ReturnPending",
                "ReturnShipping",
                "ReturnDelivered",
                "Unapproved"
            ]
            returnObject = {
                returnOrderId: {
                    $exists: true
                },
                returnPaymentId: {
                    $exists: true
                }
            }
        } else if (data.orderStatus == "Completed") {
            orderStatues = ["Cancelled", "Delivered", "PaymentFailed"]
            fromStatues = [
                "Null",
                "Pending",
                "Cancelled",
                "Delivered",
                "PaymentFailed"
            ]
        } else {
            orderStatues = ["Pending", "Shipping", "InTransport"]
            fromStatues = ["Null", "Pending", "Shipping", "InTransport"]
        }
        matchObj = {
            buyerOrganizationId: ObjectId(data.organizationId),
            $or: [
                {
                    "singleProduct.orderStatus": {
                        $in: orderStatues
                    }
                },
                {
                    "catalogueProduct.orderStatus": {
                        $in: orderStatues
                    }
                }
            ],
            ...returnObject
        }
        logMatchObject = {
            "logs.fromStatus": {
                $in: fromStatues
            },
            "logs.toStatus": {
                $in: orderStatues
            }
        }
        return { matchObj, logMatchObject }
    },
    buyerOrderPipiline(data) {
        return [
            {
                $match: data.matchObj
            },
            {
                $project: {
                    createdAt: 1,
                    buyerOrganizationId: 1,
                    buyerId: 1,
                    item: {
                        $setUnion: ["$singleProduct", "$catalogueProduct"]
                    }
                }
            },
            {
                $unwind: "$item"
            },
            {
                $project: {
                    createdAt: 1,
                    buyerId: 1,
                    buyerOrganizationId: 1,
                    item: 1,
                    logs: {
                        $last: "$item.logs"
                    }
                }
            },
            { $match: data.logMatchObject },
            {
                $sort: {
                    "logs.date": -1
                }
            },
            {
                $facet: {
                    allProducts: [
                        {
                            $skip: data.page * data.limit - data.limit
                        },
                        {
                            $limit: data.limit
                        },
                        {
                            $lookup: {
                                from: "catalogues",
                                localField: "item.catalogueId",
                                foreignField: "_id",
                                as: "item.catalogueId"
                            }
                        },
                        {
                            $unwind: {
                                path: "$item.catalogueId",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: "products",
                                localField: "item.productId",
                                foreignField: "_id",
                                as: "item.productId"
                            }
                        },
                        {
                            $unwind: {
                                path: "$item.productId",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: "users",
                                localField: "logs.user",
                                foreignField: "_id",
                                as: "logs.user"
                            }
                        },
                        {
                            $unwind: {
                                path: "$logs.user",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: "organizations",
                                localField: "item.organizationId",
                                foreignField: "_id",
                                as: "item.organizationId"
                            }
                        },
                        {
                            $unwind: "$item.organizationId"
                        },
                        {
                            $lookup: {
                                from: "organizations",
                                localField: "buyerOrganizationId",
                                foreignField: "_id",
                                as: "buyerOrganizationId"
                            }
                        },
                        {
                            $unwind: "$buyerOrganizationId"
                        },
                        {
                            $project: {
                                _id: "$item._id",
                                createdAt: 1,
                                buyerId: 1,
                                productImage: {
                                    $ifNull: [
                                        "$item.catalogueId.catalogueImage",
                                        {
                                            $first: "$item.productId.displayImage.image"
                                        }
                                    ]
                                },
                                buyerOrganizationName: {
                                    $ifNull: [
                                        "$buyerOrganizationId.companyName",
                                        ""
                                    ]
                                },
                                organizationName:
                                    "$item.organizationId.companyName",
                                orderId: "$item.orderId",
                                mainCategory: "$item.mainCategory.name",
                                orderStatus: "$item.orderStatus",
                                quantity: "$item.quantity",
                                price: "$item.price",
                                discount: "$item.discount",
                                totalGst: "$item.totalGst",
                                totalShippingCharges:
                                    "$item.totalShippingCharges",
                                returnedPrice: "$item.returnedPrice",
                                grossTotal: "$item.grossTotal",
                                logs: "$logs"
                            }
                        }
                    ],
                    totalCount: [
                        {
                            $count: "count"
                        }
                    ]
                }
            }
        ]
    },
    async getAllOrderForBuyers(data) {
        let searchText = {},
            page = data && data.page ? data.page : 1,
            limit = data && data.limit ? data.limit : 10,
            checkStatus = {}
        if (data.orderStatus == "Returned") {
            checkStatus = {
                $in: [
                    "Approved",
                    "Rejected",
                    "ReturnPending",
                    "ReturnShipping",
                    "ReturnDelivered",
                    "Unapproved"
                ]
            }
        } else if (data.orderStatus == "Completed") {
            checkStatus = {
                $in: ["Cancelled", "Delivered", "PaymentFailed"]
            }
        } else {
            checkStatus = {
                $in: ["Pending", "Shipping", "InTransport"]
            }
        }
        let organizationId = await Organization.findOne(
            { "user.userId": ObjectId(data.buyerId) },
            { _id: 1 }
        )
        // searchText.buyerId = ObjectId(data.buyerId)
        if (data.orderStatus == "Returned") {
            // searchText["returnOrderId"] = { $exists: true }
            // searchText["returnPaymentId"] = { $exists: true }
            searchText = {
                buyerOrganizationId: ObjectId(organizationId._id),
                returnOrderId: {
                    $exists: true
                },
                returnPaymentId: {
                    $exists: true
                },
                $or: [
                    {
                        "singleProduct.orderStatus": checkStatus
                    },
                    {
                        "catalogueProduct.orderStatus": checkStatus
                    }
                ]
            }
        } else if (data.orderStatus == "Completed") {
            searchText = {
                buyerOrganizationId: ObjectId(organizationId._id),
                returnPaymentId: {
                    $exists: false
                },
                returnOrderId: {
                    $exists: false
                },
                $or: [
                    {
                        "singleProduct.orderStatus": checkStatus
                    },
                    {
                        "catalogueProduct.orderStatus": checkStatus
                    }
                ]
            }
        } else {
            searchText = {
                buyerOrganizationId: ObjectId(organizationId._id),
                returnPaymentId: {
                    $exists: false
                },
                returnOrderId: {
                    $exists: false
                },
                $or: [
                    {
                        "singleProduct.orderStatus": checkStatus
                    },
                    {
                        "catalogueProduct.orderStatus": checkStatus
                    }
                ]
            }
        }
        let match1 = {
            "singleProduct.orderStatus": checkStatus
        }
        let match2 = {
            "catalogueProduct.orderStatus": checkStatus
        }
        let queryObj = {
            searchText,
            match1,
            match2,
            page,
            limit
        }
        return await PaymentModel.commonApiForAllOrders(queryObj)
    },
    async getOrderCountForTab(data) {
        let searchText = {},
            match1 = {},
            match2 = {}
        if (data && data.accessLevel == "Buyer") {
            searchText = {
                buyerId: ObjectId(data.userId),
                returnPaymentId: {
                    $exists: false
                },
                returnOrderId: {
                    $exists: false
                },
                $or: [
                    {
                        "singleProduct.orderStatus": "Pending"
                    },
                    {
                        "catalogueProduct.orderStatus": "Pending"
                    }
                ]
            }

            match1 = {
                "singleProduct.orderStatus": "Pending"
            }
            match2 = {
                "catalogueProduct.orderStatus": "Pending"
            }
        } else {
            searchText = {
                returnOrderId: {
                    $exists: false
                },
                returnPaymentId: {
                    $exists: false
                },
                transactionStatus: "PaymentSuccess",
                $or: [
                    {
                        "singleProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "singleProduct.orderStatus": "Pending"
                    },
                    {
                        "catalogueProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "catalogueProduct.orderStatus": "Pending"
                    }
                ]
            }

            match1 = {
                "singleProduct.orderStatus": "Pending",
                "singleProduct.organizationId": ObjectId(data.organizationId)
            }
            match2 = {
                "catalogueProduct.orderStatus": "Pending",
                "catalogueProduct.organizationId": ObjectId(data.organizationId)
            }
        }
        let objToSearch = {
            searchText,
            match1,
            match2
        }

        if (data && data.accessLevel == "Agent") {
            objToSearch.agentId = data.userId
        }
        let objToPush = {
            $count: "count"
        }
        let searchOutput = await PaymentModel.commonSearchFilter(objToSearch)
        searchOutput.push(objToPush)
        let countOutput = await Payment.aggregate(searchOutput)
        if (countOutput && countOutput[0] && countOutput[0].count) {
            return {
                count: countOutput[0].count
            }
        }
        return {
            count: 0
        }
    },
    async getAllPaymentForOrganization(data) {
        let matchObject = PaymentModel.getMatchObjectForPayment(data)
        matchObject.page = parseInt(data.page) > 1 ? parseInt(data.page) : 1
        matchObject.limit = parseInt(data.limit) > 0 ? parseInt(data.limit) : 10
        let facetPipeline = PaymentModel.getFacetPipelineForPayment(matchObject)
        console.log("facetPipeline", JSON.stringify(facetPipeline))

        let allPaymentData = await Payment.aggregate(facetPipeline)
        return {
            orderData:
                allPaymentData &&
                allPaymentData[0] &&
                allPaymentData[0].allProducts
                    ? allPaymentData[0].allProducts
                    : [],
            totalCount:
                allPaymentData &&
                allPaymentData[0] &&
                allPaymentData[0].totalCount &&
                allPaymentData[0].totalCount[0] &&
                allPaymentData[0].totalCount[0].count
                    ? allPaymentData[0].totalCount[0].count
                    : 0
        }
    },
    getMatchObjectForPayment(data) {
        let matchObject = {},
            orderStatues,
            fromStatues,
            itemMatchObject = {},
            logMatchObject = {}
        if (data.orderStatus == "Returned") {
            fromStatues = [
                "ReturnPending",
                "Approved",
                "Rejected",
                "ReturnShipping",
                "ReturnDelivered",
                "Unapproved"
            ]
            orderStatues = [
                "Approved",
                "Rejected",
                "ReturnShipping",
                "ReturnDelivered",
                "Unapproved"
            ]
            matchObject = {
                $or: [
                    {
                        "singleProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "singleProduct.orderStatus": {
                            $in: orderStatues
                        }
                    },
                    {
                        "catalogueProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "catalogueProduct.orderStatus": {
                            $in: orderStatues
                        }
                    }
                ],
                returnOrderId: {
                    $exists: true
                },
                returnPaymentId: {
                    $exists: true
                }
            }
        } else if (data.orderStatus == "Completed") {
            fromStatues = ["Pending", "Delivered", "ReturnPending"]
            orderStatues = [
                "Cancelled",
                "Delivered",
                "ReturnPending",
                "ReturnApplied",
                "Rejected"
            ]
            matchObject = {
                $or: [
                    {
                        "singleProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "singleProduct.orderStatus": {
                            $in: orderStatues
                        }
                    },
                    {
                        "catalogueProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "catalogueProduct.orderStatus": {
                            $in: orderStatues
                        }
                    }
                ],
                returnPaymentId: {
                    $exists: false
                },
                returnOrderId: {
                    $exists: false
                }
            }
        } else {
            fromStatues = ["Null", "Pending", "Shipping", "InTransport"]
            orderStatues = ["Pending", "Shipping", "InTransport"]
            matchObject = {
                $or: [
                    {
                        "singleProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "singleProduct.orderStatus": {
                            $in: orderStatues
                        }
                    },
                    {
                        "catalogueProduct.organizationId": ObjectId(
                            data.organizationId
                        ),
                        "catalogueProduct.orderStatus": {
                            $in: orderStatues
                        }
                    }
                ],
                returnPaymentId: {
                    $exists: false
                },
                returnOrderId: {
                    $exists: false
                }
            }
        }
        itemMatchObject = {
            "item.orderStatus": {
                $in: orderStatues
            }
        }
        logMatchObject = {
            "logs.fromStatus": {
                $in: fromStatues
            },
            "logs.toStatus": {
                $in: orderStatues
            }
        }
        let secondMatch = {
            "item.organizationId": ObjectId(data.organizationId)
        }
        matchObject.$or = [
            {
                transactionStatus: "PaymentSuccess"
            },
            {
                transactionStatus: "ReturnShipping"
            }
        ]

        return { matchObject, itemMatchObject, logMatchObject, secondMatch }
    },
    getFacetPipelineForPayment(data) {
        return [
            {
                $match: data.matchObject
            },
            {
                $project: {
                    createdAt: 1,
                    buyerOrganizationId: 1,
                    buyerId: 1,
                    item: {
                        $setUnion: ["$singleProduct", "$catalogueProduct"]
                    }
                }
            },
            {
                $unwind: "$item"
            },
            {
                $match: data.secondMatch
            },
            { $match: data.itemMatchObject },
            {
                $project: {
                    createdAt: 1,
                    buyerId: 1,
                    buyerOrganizationId: 1,
                    item: 1,
                    logs: {
                        $last: "$item.logs"
                    }
                }
            },
            { $match: data.logMatchObject },
            {
                $sort: {
                    "logs.date": -1
                }
            },
            {
                $facet: {
                    allProducts: [
                        {
                            $skip: data.page * data.limit - data.limit
                        },
                        {
                            $limit: data.limit
                        },
                        {
                            $lookup: {
                                from: "catalogues",
                                localField: "item.catalogueId",
                                foreignField: "_id",
                                as: "item.catalogueId"
                            }
                        },
                        {
                            $unwind: {
                                path: "$item.catalogueId",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: "products",
                                localField: "item.productId",
                                foreignField: "_id",
                                as: "item.productId"
                            }
                        },
                        {
                            $unwind: {
                                path: "$item.productId",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: "users",
                                localField: "logs.user",
                                foreignField: "_id",
                                as: "logs.user"
                            }
                        },
                        {
                            $unwind: {
                                path: "$logs.user",
                                preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $lookup: {
                                from: "organizations",
                                localField: "item.organizationId",
                                foreignField: "_id",
                                as: "item.organizationId"
                            }
                        },
                        {
                            $unwind: "$item.organizationId"
                        },
                        {
                            $lookup: {
                                from: "organizations",
                                localField: "buyerOrganizationId",
                                foreignField: "_id",
                                as: "buyerOrganizationId"
                            }
                        },
                        {
                            $unwind: "$buyerOrganizationId"
                        },
                        {
                            $addFields: {
                                productPrice: {
                                    $ifNull: [
                                        "$item.productId.pricePerPiece",
                                        "$item.price"
                                    ]
                                }
                            }
                        },
                        {
                            $addFields: {
                                discountedPrice: {
                                    $cond: {
                                        if: {
                                            $gt: ["$item.discount", 0]
                                        },
                                        then: {
                                            $round: [
                                                {
                                                    $subtract: [
                                                        "$productPrice",
                                                        {
                                                            $divide: [
                                                                {
                                                                    $multiply: [
                                                                        "$productPrice",
                                                                        "$item.discount"
                                                                    ]
                                                                },
                                                                100
                                                            ]
                                                        }
                                                    ]
                                                },
                                                2
                                            ]
                                        },
                                        else: "$productPrice"
                                    }
                                }
                            }
                        },
                        {
                            $project: {
                                _id: "$item._id",
                                createdAt: 1,
                                buyerId: 1,
                                productImage: {
                                    $ifNull: [
                                        "$item.catalogueId.catalogueImage",
                                        {
                                            $first: "$item.productId.displayImage.image"
                                        }
                                    ]
                                },
                                buyerOrganizationName: {
                                    $ifNull: [
                                        "$buyerOrganizationId.companyName",
                                        ""
                                    ]
                                },
                                organizationName:
                                    "$item.organizationId.companyName",
                                orderId: "$item.orderId",
                                mainCategory: "$item.mainCategory.name",
                                orderStatus: "$item.orderStatus",
                                quantity: "$item.quantity",
                                price: {
                                    $multiply: [
                                        "$item.quantity",
                                        "$discountedPrice"
                                    ]
                                },
                                temp: {
                                    $add: ["$productPrice", 100]
                                },
                                totalGst: "$item.totalGst",
                                returnedPrice: "$item.returnedPrice",
                                logs: "$logs",
                                productPrice: 1
                                
                            }
                        }
                    ],
                    totalCount: [
                        {
                            $count: "count"
                        }
                    ]
                }
            }
        ]
    },
    async getAllPaymentForOrganizations(data) {
        let searchText = {},
            page = data && data.page ? data.page : 1,
            limit = data && data.limit ? data.limit : 10,
            checkStatus = {}
        if (data.orderStatus == "Returned") {
            checkStatus = {
                $in: [
                    "Approved",
                    "Rejected",
                    "ReturnShipping",
                    "ReturnDelivered",
                    "Unapproved"
                ]
            }
        } else if (data.orderStatus == "Completed") {
            checkStatus = {
                $in: ["Cancelled", "Delivered", "ReturnPending", "Rejected"]
            }
        } else {
            checkStatus = {
                $in: ["Pending", "Shipping", "InTransport"]
            }
        }
        let sendData = [
            {
                "singleProduct.organizationId": ObjectId(data.organizationId),
                "singleProduct.orderStatus": checkStatus
            },
            {
                "catalogueProduct.organizationId": ObjectId(
                    data.organizationId
                ),
                "catalogueProduct.orderStatus": checkStatus
            }
        ]
        if (data.orderStatus == "Returned") {
            // searchText["returnOrderId"] = { $exists: true }
            // searchText["returnPaymentId"] = { $exists: true }
            searchText = {
                returnOrderId: {
                    $exists: true
                },
                returnPaymentId: {
                    $exists: true
                }
            }
        } else if (data.orderStatus == "Completed") {
            searchText = {
                returnOrderId: {
                    $exists: false
                },
                returnPaymentId: {
                    $exists: false
                }
            }
        } else {
            searchText = {
                transactionStatus: "PaymentSuccess",
                returnOrderId: {
                    $exists: false
                },
                returnPaymentId: {
                    $exists: false
                },
                $or: sendData
            }
        }
        let match1 = {
            "singleProduct.orderStatus": checkStatus,
            "singleProduct.organizationId": ObjectId(data.organizationId)
        }
        let match2 = {
            "catalogueProduct.orderStatus": checkStatus,
            "catalogueProduct.organizationId": ObjectId(data.organizationId)
        }
        let queryObj = {
            searchText,
            match1,
            match2,
            page,
            limit
        }
        if (data && data.agentId) {
            queryObj.agentId = data.agentId
        }
        return await PaymentModel.commonApiForAllOrders(queryObj)
    },
    async commonApiForAllOrders(data) {
        let outputData = await PaymentModel.commonSearchFilter(data)
        let page = parseInt(data.page) > 1 ? parseInt(data.page) : 1
        let limit = parseInt(data.limit) > 0 ? parseInt(data.limit) : 10
        let objTopush = {
            $facet: {
                allProducts: [
                    {
                        $project: {
                            product: "$items.product",
                            buyerId: "$items.buyerId",
                            createdAt: "$items.createdAt"
                        }
                    },
                    {
                        $skip: page * limit - limit
                    },
                    {
                        $limit: limit
                    },
                    {
                        $lookup: {
                            from: "organizations",
                            localField: "product.organizationId",
                            foreignField: "_id",
                            as: "product.organizationId"
                        }
                    },
                    {
                        $unwind: {
                            path: "$product.organizationId",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "categories",
                            localField: "product.productDetails.category",
                            foreignField: "_id",
                            as: "product.productDetails.category"
                        }
                    },

                    {
                        $unwind: {
                            path: "$product.productDetails.category",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "maincategories",
                            localField: "product.productDetails.mainCategory",
                            foreignField: "_id",
                            as: "product.productDetails.mainCategory"
                        }
                    },
                    {
                        $unwind: {
                            path: "$product.productDetails.mainCategory",
                            preserveNullAndEmptyArrays: true
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            let: {
                                id: "$product.sellerId"
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: ["$_id", "$$id"]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        name: 1
                                    }
                                }
                            ],
                            as: "product.seller_detail"
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            let: {
                                id: "$buyerId"
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $eq: ["$_id", "$$id"]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        name: 1
                                    }
                                }
                            ],
                            as: "product.buyer_detail"
                        }
                    },
                    {
                        $lookup: {
                            from: "organizations",
                            let: {
                                id: "$buyerId"
                            },
                            pipeline: [
                                {
                                    $unwind: "$user"
                                },
                                {
                                    $match: {
                                        $expr: {
                                            $eq: ["$user.userId", "$$id"]
                                        }
                                    }
                                },
                                {
                                    $project: {
                                        companyName: 1
                                    }
                                }
                            ],
                            as: "product.buyer_organization"
                        }
                    }
                ],
                totalCount: [
                    {
                        $count: "count"
                    }
                ]
            }
        }
        outputData.push(objTopush)
        // return outputData
        let allPaymentData = await Payment.aggregate(outputData)
        console.log("allPaymentData", JSON.stringify(outputData))
        // console.log("here is allPaymentData", allPaymentData[0].allProducts)
        if (
            allPaymentData &&
            allPaymentData[0] &&
            allPaymentData[0].allProducts
        ) {
            allPaymentData[0].allProducts.map(async (item, index) => {
                allPaymentData[0].allProducts[index].product.price = _.round(
                    item.product.price,
                    2
                )
                allPaymentData[0].allProducts[index].product.orignalPrice =
                    _.round(item.product.orignalPrice, 2)
                allPaymentData[0].allProducts[index].product.grossTotal =
                    _.round(item.product.grossTotal, 2)
                allPaymentData[0].allProducts[
                    index
                ].product.totalShippingCharges = _.round(
                    item.product.totalShippingCharges,
                    2
                )
                allPaymentData[0].allProducts[index].product.totalGst = _.round(
                    item.product.totalGst,
                    2
                )
            })
        }
        return {
            orderData:
                allPaymentData &&
                allPaymentData[0] &&
                allPaymentData[0].allProducts
                    ? allPaymentData[0].allProducts
                    : [],
            totalCount:
                allPaymentData &&
                allPaymentData[0] &&
                allPaymentData[0].totalCount &&
                allPaymentData[0].totalCount[0] &&
                allPaymentData[0].totalCount[0].count
                    ? allPaymentData[0].totalCount[0].count
                    : 0
        }
    },
    commonSearchFilter(data) {
        console.log("data inside", data)
        return [
            {
                $match: data.searchText
            },
            {
                $sort: {
                    _id: -1
                }
            },
            {
                $facet: {
                    singleProduct: [
                        {
                            $unwind: {
                                path: "$singleProduct"
                                // preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $match: data.match1
                        },
                        {
                            $lookup: {
                                from: "products",
                                localField: "singleProduct.productId",
                                foreignField: "_id",
                                as: "singleProduct.productDetails"
                            }
                        },
                        {
                            $unwind: {
                                path: "$singleProduct.productDetails"
                                // preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $project: {
                                transactionStatus: 1,
                                buyerId: 1,
                                product: "$singleProduct",
                                createdAt: 1
                                // "product.buyerId": "$buyerId"
                            }
                        }
                    ],
                    catalogueProduct: [
                        {
                            $unwind: {
                                path: "$catalogueProduct"
                                // preserveNullAndEmptyArrays: true
                            }
                        },
                        {
                            $match: data.match2
                        },
                        {
                            $lookup: {
                                from: "catalogues",
                                localField: "catalogueProduct.catalogueId",
                                foreignField: "_id",
                                as: "catalogueProduct.productDetails"
                            }
                        },

                        {
                            $unwind: {
                                path: "$catalogueProduct.productDetails"
                                // preserveNullAndEmptyArrays: trues
                            }
                        },
                        {
                            $project: {
                                transactionStatus: 1,
                                buyerId: 1,
                                product: "$catalogueProduct",
                                // "product.buyerId": "$buyerId"
                                createdAt: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    items: {
                        $setUnion: ["$singleProduct", "$catalogueProduct"]
                    },
                    buyerId: "$buyerId",
                    createdAt: "$createdAt"
                }
            },
            {
                $unwind: {
                    path: "$items"
                    // preserveNullAndEmptyArrays: true
                }
            },
            // {
            //     $unwind: {
            //         path: "$logs",
            //         preserveNullAndEmptyArrays: true
            //     }
            // },
            {
                $lookup: {
                    from: "agentearnings",
                    localField: "items.product.earning",
                    foreignField: "_id",
                    as: "items.product.earning"
                }
            },
            {
                $unwind: {
                    path: "$items.product.earning",
                    preserveNullAndEmptyArrays:
                        data && data.agentId ? false : true
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "items.product.logs.user",
                    foreignField: "_id",
                    as: "items.product.logs.user"
                }
            },
            //     {
            //     $lookup: {
            //         from: "users",
            //         let: { client_id: "$item.product.logs.user" },
            //         pipeline : [
            //             { $match: { $expr: { $eq: [ "$_id", "ObjectId($$client_id)" ] } }, },
            //             { $project : { _id:1, email:1 } }
            //         ],
            //         as: "item.product.logs1"
            //     }
            // },
            {
                $sort: {
                    // "items.product.logs.date": -1
                    "items.product._id": -1
                }
            }
        ]
    },
    async getOneOrder(data) {
        console.log("getOnePayment", data)
        let searchText = {}
        // searchText.buyerId = ObjectId(data.buyerId)
        searchText = {
            $or: [
                {
                    singleProduct: {
                        $elemMatch: {
                            _id: ObjectId(data.productOrderId)
                        }
                    }
                },
                {
                    catalogueProduct: {
                        $elemMatch: {
                            _id: ObjectId(data.productOrderId)
                        }
                    }
                }
            ]
        }
        let onePaymentData = await Payment.findOne(searchText, {
            singleProduct: {
                $elemMatch: {
                    _id: ObjectId(data.productOrderId)
                }
            },
            catalogueProduct: {
                $elemMatch: {
                    _id: ObjectId(data.productOrderId)
                }
            },
            buyerId: 1,
            createdAt: 1,
            returnProductImage: 1,
            returnPaymentId: 1,
            returnOrderId: 1,
            buyerShippingAddress: 1,
            buyerBillingAddress: 1,
            returnReason: 1,
            courierCompanyName: 1,
            trackingId: 1,
            rejectionReason: 1,
            orignalPrice: 1
        })
            .lean()
            .populate({
                path: "catalogueProduct.catalogueId",
                model: "Catalogue",
                populate: {
                    path: "mainCategory",
                    model: "MainCategory"
                }
                // populate: {
                //     path: "category",
                //     model: "Category"
                // },
                // populate: {
                //     path: "productId",
                //     model: "Product"
                // }
            })
            .populate({
                path: "catalogueProduct.catalogueId",
                model: "Catalogue",
                populate: {
                    path: "category",
                    model: "Category"
                }
            })
            .populate({
                path: "catalogueProduct.products",
                model: "Catalogue",
                populate: {
                    path: "productId",
                    model: "Product"
                },
                sort: { createdAt: 1 }
            })
            // .sort({createdAt: -1})
            .populate({
                path: "catalogueProduct.organizationId",
                model: "Organization"
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "mainCategory",
                    model: "MainCategory"
                }
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "category",
                    model: "Category"
                }
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "organization",
                    model: "Organization"
                }
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "user",
                    model: "User"
                }
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "subCategory",
                    model: "SubCategory"
                }
            })
            .populate("buyerId")
        console.log("OPD", JSON.stringify(onePaymentData))
        if (
            onePaymentData &&
            onePaymentData.singleProduct &&
            onePaymentData.singleProduct[0] &&
            onePaymentData.singleProduct.length
        ) {
            onePaymentData["gstAmount"] = _.round(
                onePaymentData.singleProduct[0].totalGst,
                2
            )
            onePaymentData["productAmount"] = _.round(
                onePaymentData.singleProduct[0].price,
                2
            )
            onePaymentData.singleProduct[0].price = _.round(
                onePaymentData.singleProduct[0].price,
                2
            )
            onePaymentData["shippingAmount"] = _.round(
                onePaymentData.singleProduct[0].totalShippingCharges,
                2
            )
            onePaymentData["totalAmount"] = _.round(
                onePaymentData.singleProduct[0].grossTotal,
                2
            )
        } else {
            onePaymentData["gstAmount"] = _.round(
                onePaymentData.catalogueProduct[0].totalGst,
                2
            )
            onePaymentData["productAmount"] = _.round(
                onePaymentData.catalogueProduct[0].price,
                2
            )
            onePaymentData.catalogueProduct[0].price = _.round(
                onePaymentData.catalogueProduct[0].price,
                2
            )
            onePaymentData["shippingAmount"] = _.round(
                onePaymentData.catalogueProduct[0].totalShippingCharges,
                2
            )
            onePaymentData["totalAmount"] = _.round(
                onePaymentData.catalogueProduct[0].grossTotal,
                2
            )
            onePaymentData["totalWeight"] = _.round(
                onePaymentData.catalogueProduct[0].totalWeight,
                2
            )
        }
        //     if (
        //         onePaymentData.singleProduct[0].catalogueProduct &&
        //         onePaymentData.singleProduct[0].catalogueProduct.length &&
        //         onePaymentData.singleProduct[0].catalogueProduct[0]
        //             .catalogueId &&
        //         onePaymentData.singleProduct[0].catalogueProduct[0].catalogueId
        //             .prefferredAgent
        //     ) {
        //         let outputData = await User.findOne(
        //             {
        //                 _id: ObjectId(
        //                     onePaymentData.singleProduct[0].catalogueProduct[0]
        //                         .catalogueId.prefferredAgent
        //                 )
        //             },
        //             {
        //                 name: 1
        //             }
        //         )

        //         outputData && outputData.name
        //             ? (onePaymentData.agentName = outputData.name)
        //             : ""
        //     }
        //     if (
        //         onePaymentData.singleProduct[0].size &&
        //         onePaymentData.singleProduct[0].size.length
        //     ) {
        //         let selectedSize = await MyCartModel.getSelectedSize(
        //             onePaymentData.singleProduct[0].size
        //         )
        //         onePaymentData["gstAmount"] =
        //             (onePaymentData.singleProduct[0].price *
        //                 onePaymentData.singleProduct[0].quantity *
        //                 selectedSize.length *
        //                 onePaymentData.singleProduct[0].gst) /
        //             100
        //         onePaymentData["productAmount"] =
        //             onePaymentData.singleProduct[0].price *
        //             onePaymentData.singleProduct[0].quantity *
        //             selectedSize.length
        //         onePaymentData["totalAmount"] =
        //             onePaymentData["gstAmount"] +
        //             onePaymentData.singleProduct[0].price *
        //                 onePaymentData.singleProduct[0].quantity *
        //                 selectedSize.length
        //         onePaymentData["shippingAmount"] =
        //             onePaymentData.singleProduct[0].totalWeight * 100
        //     } else {
        //         onePaymentData["gstAmount"] =
        //             (onePaymentData.singleProduct[0].price *
        //                 onePaymentData.singleProduct[0].quantity *
        //                 onePaymentData.singleProduct[0].gst) /
        //             100
        //         onePaymentData["productAmount"] =
        //             onePaymentData.singleProduct[0].price *
        //             onePaymentData.singleProduct[0].quantity
        //         onePaymentData["totalAmount"] =
        //             onePaymentData["gstAmount"] +
        //             onePaymentData.singleProduct[0].price *
        //                 onePaymentData.singleProduct[0].quantity
        //         onePaymentData["shippingAmount"] =
        //             onePaymentData["gstAmount"] +
        //             onePaymentData.singleProduct[0].price *
        //                 onePaymentData.singleProduct[0].quantity
        //         onePaymentData["shippingAmount"] =
        //             onePaymentData.singleProduct[0].totalWeight * 100
        //     }
        // } else if (
        //     onePaymentData &&
        //     onePaymentData.catalogueProduct &&
        //     onePaymentData.catalogueProduct[0] &&
        //     onePaymentData.catalogueProduct.length
        // ) {
        //     if (
        //         onePaymentData.catalogueProduct[0].catalogueId &&
        //         onePaymentData.catalogueProduct[0].catalogueId
        //             .prefferredAgent &&
        //         onePaymentData.catalogueProduct[0].catalogueId.prefferredAgent
        //             .length
        //     ) {
        //         let outputData = await User.findOne(
        //             {
        //                 _id: ObjectId(
        //                     onePaymentData.catalogueProduct[0].catalogueId
        //                         .prefferredAgent[0]
        //                 )
        //             },
        //             {
        //                 name: 1
        //             }
        //         )
        //         outputData && outputData.name
        //             ? (onePaymentData.agentName = outputData.name)
        //             : ""
        //     }

        //     if (onePaymentData.catalogueProduct[0].scenario == "sellAll") {
        //         let gstAmount = 0,
        //             productAmount = 0,
        //             shippingAmount = 0
        //         onePaymentData.catalogueProduct[0].products.forEach(
        //             (singleProduct) => {
        //                 if (singleProduct.size && singleProduct.size.length) {
        //                     gstAmount +=
        //                         (singleProduct.price *
        //                             singleProduct.size.length *
        //                             onePaymentData.catalogueProduct[0]
        //                                 .quantity *
        //                             onePaymentData.catalogueProduct[0].gst) /
        //                         100

        //                     productAmount +=
        //                         singleProduct.price *
        //                         singleProduct.size.length *
        //                         onePaymentData.catalogueProduct[0].quantity
        //                 } else {
        //                     gstAmount +=
        //                         (singleProduct.price *
        //                             onePaymentData.catalogueProduct[0]
        //                                 .quantity *
        //                             onePaymentData.catalogueProduct[0].gst) /
        //                         100

        //                     productAmount +=
        //                         singleProduct.price *
        //                         onePaymentData.catalogueProduct[0].quantity
        //                 }
        //             }
        //         )
        //         onePaymentData["gstAmount"] = gstAmount
        //         onePaymentData["productAmount"] = productAmount
        //         onePaymentData["shippingAmount"] =
        //             onePaymentData.catalogueProduct[0].totalWeight * 100
        //         onePaymentData["totalAmount"] =
        //             onePaymentData["gstAmount"] +
        //             onePaymentData["productAmount"] +
        //             onePaymentData["shippingAmount"]
        //     } else if (
        //         onePaymentData.catalogueProduct[0].scenario == "ignoreDesign"
        //     ) {
        //         let gstAmount = 0,
        //             productAmount = 0,
        //             shippingAmount = 0
        //         onePaymentData.catalogueProduct[0].products.forEach(
        //             (singleProduct) => {
        //                 if (singleProduct.selected) {
        //                     if (
        //                         singleProduct.size &&
        //                         singleProduct.size.length
        //                     ) {
        //                         gstAmount +=
        //                             (singleProduct.price *
        //                                 singleProduct.size.length *
        //                                 onePaymentData.catalogueProduct[0]
        //                                     .quantity *
        //                                 onePaymentData.catalogueProduct[0]
        //                                     .gst) /
        //                             100

        //                         productAmount +=
        //                             singleProduct.price *
        //                             singleProduct.size.length *
        //                             onePaymentData.catalogueProduct[0].quantity
        //                     } else {
        //                         gstAmount +=
        //                             (singleProduct.price *
        //                                 onePaymentData.catalogueProduct[0]
        //                                     .quantity *
        //                                 onePaymentData.catalogueProduct[0]
        //                                     .gst) /
        //                             100

        //                         productAmount +=
        //                             singleProduct.price *
        //                             onePaymentData.catalogueProduct[0].quantity
        //                     }

        //                     // onePaymentData["shippingAmount"] =
        //                     //     onePaymentData["gstAmount"] +
        //                     //     onePaymentData.catalogueProduct[0].price *
        //                     //         onePaymentData.catalogueProduct[0].quantity
        //                     // onePaymentData["shippingAmount"] =
        //                     //     onePaymentData.catalogueProduct[0].totalWeight *
        //                     //     100
        //                 }
        //             }
        //         )
        //         onePaymentData["gstAmount"] = gstAmount
        //         onePaymentData["productAmount"] = productAmount
        //         onePaymentData["shippingAmount"] =
        //             onePaymentData.catalogueProduct[0].totalWeight * 100
        //         onePaymentData["totalAmount"] =
        //             onePaymentData["gstAmount"] +
        //             onePaymentData["productAmount"] +
        //             onePaymentData["shippingAmount"]
        //     } else if (
        //         onePaymentData.catalogueProduct[0].scenario == "ignoreSize"
        //     ) {
        //         let gstAmount = 0,
        //             productAmount = 0,
        //             shippingAmount = 0
        //         onePaymentData.catalogueProduct[0].products.forEach(
        //             (singleProduct) => {
        //                 // if (singleProduct.selected) {
        //                 if (singleProduct.size && singleProduct.size.length) {
        //                     gstAmount +=
        //                         (singleProduct.price *
        //                             singleProduct.size.length *
        //                             onePaymentData.catalogueProduct[0]
        //                                 .quantity *
        //                             onePaymentData.catalogueProduct[0].gst) /
        //                         100

        //                     productAmount +=
        //                         singleProduct.price *
        //                         singleProduct.size.length *
        //                         onePaymentData.catalogueProduct[0].quantity
        //                 }

        //                 // onePaymentData["shippingAmount"] =
        //                 //     onePaymentData["gstAmount"] +
        //                 //     onePaymentData.catalogueProduct[0].price *
        //                 //         onePaymentData.catalogueProduct[0].quantity
        //                 // onePaymentData["shippingAmount"] =
        //                 //     onePaymentData.catalogueProduct[0].totalWeight *
        //                 //     100
        //                 // }
        //             }
        //         )
        //         onePaymentData["gstAmount"] = gstAmount
        //         onePaymentData["productAmount"] = productAmount
        //         onePaymentData["shippingAmount"] =
        //             onePaymentData.catalogueProduct[0].totalWeight * 100
        //         onePaymentData["totalAmount"] =
        //             onePaymentData["gstAmount"] +
        //             onePaymentData["productAmount"] +
        //             onePaymentData["shippingAmount"]
        //     }
        // }
        if (
            onePaymentData.singleProduct &&
            onePaymentData.singleProduct[0] &&
            onePaymentData.singleProduct[0].productId &&
            onePaymentData.singleProduct[0].productId.prefferredAgent
        ) {
            let agentName = await User.findById(
                onePaymentData.singleProduct[0].productId.prefferredAgent
            )
            console.log("agentssss", agentName)
            if (agentName && agentName.name) {
                onePaymentData.agentName = agentName.name
            }
        } else if (
            onePaymentData.catalogueProduct &&
            onePaymentData.catalogueProduct[0] &&
            onePaymentData.catalogueProduct[0].catalogueId &&
            onePaymentData.catalogueProduct[0].catalogueId.prefferredAgent
        ) {
            let agentName = await User.findById(
                onePaymentData.catalogueProduct[0].catalogueId.prefferredAgent
            )
            console.log("agentssss", agentName)
            if (agentName && agentName.name) {
                onePaymentData.agentName = agentName.name
            }
        }
        if (onePaymentData.buyerShippingAddress == null) {
            let address = await Organization.findOne({
                "user.userId": onePaymentData.buyerId._id
            })
            onePaymentData.buyerShippingAddress = address.shippingAddress[0]
        }

        // if retrunProduct is true you can return product to seller
        Date.prototype.addHours = function (h) {
            this.setHours(this.getHours() + h)
            return this
        }
        let logs = Array.isArray(onePaymentData.singleProduct)
            ? onePaymentData.singleProduct[0].logs
            : onePaymentData.catalogueProduct[0].logs
        let deliveryDate = logs.filter((log) => {
            if (log.toStatus == "Delivered") {
                return log
            }
        })[0]
        let orderDate = logs.filter((log) => {
            if (log.toStatus == "Pending") {
                return log
            }
        })[0]
        if (deliveryDate) {
            deliveryDate = new Date(deliveryDate.date)
            onePaymentData.deliveryDate = deliveryDate
        }
        if (orderDate) {
            orderDate = new Date(orderDate.date)
            onePaymentData.orderDate = orderDate
        }
        let dateNow = new Date()
        onePaymentData.dateNow = dateNow

        console.log("deliveryDate", deliveryDate)
        console.log("orderDate", orderDate)
        console.log("dateNow", dateNow)
        // console.log("onePaymentData onePaymentData", onePaymentData)
        return onePaymentData
    },
    async deliverOrderProductAndGenerateInvoice(data) {
        let queryObj = {},
            updateObj = {},
            pushObj = {}

        let findOneOrder = await PaymentModel.getOneOrder({
            productOrderId: data.singleProductOrderId
                ? data.singleProductOrderId
                : data.catalogueProductOrderId
        })
        if (_.isEmpty(findOneOrder)) {
            return "No Order Found"
        }
        console.log("findOneOrder", findOneOrder)
        queryObj._id = ObjectId(data.orderId)
        // queryObj.userId = ObjectId(data.userId)
        // queryObj = {
        //     $or: [
        //         {
        //             "singleProduct._id": ObjectId(data.singleProductPaymentId)
        //         },
        //         {
        //             "catalogueProduct._id": ObjectId(
        //                 data.catalogueProductPaymentId
        //             )
        //         }
        //     ]
        // }
        let deliveringUser = await User.findById(data.userId)
        if (data.singleProductOrderId) {
            queryObj["singleProduct._id"] = ObjectId(data.singleProductOrderId)
            updateObj = {
                "singleProduct.$.orderStatus": data.orderStatus
            }
            pushObj = {
                "singleProduct.$.logs": {
                    fromStatus: "Pending",
                    toStatus: data.orderStatus,
                    date: new Date(),
                    name: deliveringUser.name,
                    user: ObjectId(data.userId)
                }
            }
        } else {
            queryObj["catalogueProduct._id"] = ObjectId(
                data.catalogueProductOrderId
            )
            updateObj = {
                "catalogueProduct.$.orderStatus": data.orderStatus
            }
            pushObj = {
                "catalogueProduct.$.logs": {
                    fromStatus: "Pending",
                    toStatus: data.orderStatus,
                    date: new Date(),
                    name: deliveringUser.name,
                    userId: ObjectId(data.userId)
                }
            }
        }
        // sendInvoiceObj = {
        //     buyerId: PaymentData.buyerId,
        //     sellerId: data.sellerId,
        //     organizationId: data.organizationId,
        //     PaymentId: PaymentData._id
        // }
        let updateOnePayment = await Payment.updateOne(
            queryObj,
            {
                $push: pushObj,
                $set: updateObj
            },
            {
                new: true
            }
        )
        let productOrderId = {}
        if (data.singleProductOrderId) {
            productOrderId.singleProductOrderId = data.singleProductOrderId
        } else {
            productOrderId.catalogueProductOrderId =
                data.catalogueProductOrderId
        }
        if (!updateOnePayment.nModified) {
            return "No Order Found"
        }
        return InvoiceModel.readyToShipInvoices({
            paymentId: data.orderId,
            productOrderId: productOrderId
        })
    },
    async getAllReturnOrderForAdmin(data) {
        try {
            let returnOrderPipeline = await PaymentModel.returnOrderPipeline(
                data
            )
            let allPaymentData = await Payment.aggregate(returnOrderPipeline)

            return {
                orderData: allPaymentData[0].paginatedResult,
                totalCount: allPaymentData[0].totalCount
            }
        } catch (error) {
            console.log(error)
            return error
        }
    },
    async returnOrderPipeline(data) {
        let page = parseInt(data.page) > 1 ? parseInt(data.page) : 1
        let limit = parseInt(data.limit) > 0 ? parseInt(data.limit) : 10

        let searchText = {}
        if (data.transactionStatus == "ReturnPending") {
            searchText = {
                transactionStatus: "ReturnPending"
            }
        }
        if (data.filter) {
            let matchFilters = await PaymentModel.getMatchFilters(data.filter)
            searchText = { ...matchFilters, ...searchText }
        }
        let match = [
            {
                $match: searchText
            }
        ]
        let facetPipeline = [
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $skip: page * limit - limit
            },
            {
                $limit: limit
            },
            {
                $lookup: {
                    from: "organizations",
                    localField: "buyerId",
                    foreignField: "user.userId",
                    as: "buyerId"
                }
            },
            {
                $unwind: {
                    path: "$buyerId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "catalogues",
                    localField: "catalogueProduct.catalogueId",
                    foreignField: "_id",
                    as: "catalogueId"
                }
            },
            {
                $unwind: {
                    path: "$catalogueId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "organizations",
                    localField: "catalogueProduct.organizationId",
                    foreignField: "_id",
                    as: "catalogue.sellerId"
                }
            },
            {
                $unwind: {
                    path: "$catalogue.sellerId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "singleProduct.productId",
                    foreignField: "_id",
                    as: "productId"
                }
            },
            {
                $unwind: {
                    path: "$productId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "organizations",
                    localField: "singleProduct.organizationId",
                    foreignField: "_id",
                    as: "product.sellerId"
                }
            },
            {
                $unwind: {
                    path: "$product.sellerId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    createdAt: 1,
                    transactionStatus: 1,
                    buyerName: "$buyerId.companyName",
                    returnedPrice: {
                        $cond: {
                            if: { $eq: ["$product", {}] },
                            then: { $first: "$catalogueProduct.returnedPrice" },
                            else: { $first: "$singleProduct.returnedPrice" }
                        }
                    },
                    orderId: {
                        $cond: {
                            if: { $eq: ["$product", {}] },
                            then: { $first: "$catalogueProduct.orderId" },
                            else: { $first: "$singleProduct.orderId" }
                        }
                    },
                    orderValue: {
                        $cond: {
                            if: { $eq: ["$product", {}] },
                            then: { $first: "$catalogueProduct.price" },
                            else: { $first: "$singleProduct.price" }
                        }
                    },

                    productName: {
                        $cond: {
                            if: { $eq: ["$product", {}] },
                            then: "$catalogueId.name",
                            else: "$productId.name"
                        }
                    },
                    manufacturerName: {
                        $cond: {
                            if: { $eq: ["$product", {}] },
                            then: "$catalogue.sellerId.companyName",
                            else: "$product.sellerId.companyName"
                        }
                    }
                }
            }
        ]
        let returnOrderPipeline = [...match, ...facetPipeline]
        let totalCount = match.concat([
            {
                $count: "total"
            }
        ])
        return [
            {
                $facet: {
                    paginatedResult: returnOrderPipeline,
                    totalCount: totalCount
                }
            }
        ]
    },
    async getMatchFilters(filter) {
        let filters = {}
        if (filter.date) {
            let fromDate = new Date(filter.date[0])
            let toDate = new Date(filter.date[1])
            filters.createdAt = {
                $gte: fromDate,
                $lte: toDate
            }
        }
        if (filter.mfgName) {
            let mfgOrganization = await User.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.mfgName,
                            $options: "i"
                        },
                        accessLevel: "Manufacturer"
                    }
                },
                {
                    $project: {
                        _id: 1
                    }
                }
            ])
            let userIds = mfgOrganization.map((org) => {
                return org._id
            })
            let organizationIds = await aggregate([
                {
                    $match: {
                        "user.userId": {
                            $in: userIds
                        }
                    }
                },
                {
                    $project: {
                        _id: 1
                    }
                }
            ])
            let orgIds = organizationIds.map((org) => {
                return org._id
            })
            filters.catalogueProduct = {
                organisationId: {
                    $in: orgIds
                }
            }
            filters.singleProduct = {
                organisationId: {
                    $in: orgIds
                }
            }
        }
        if (filter.buyersName) {
            let mfgOrganization = await User.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.mfgName,
                            $options: "i"
                        },
                        accessLevel: "Buyer"
                    }
                },
                {
                    $project: {
                        _id: 1
                    }
                }
            ])
            let userIds = mfgOrganization.map((org) => {
                return org._id
            })
            let organizationIds = await aggregate([
                {
                    $match: {
                        "user.userId": {
                            $in: userIds
                        }
                    }
                },
                {
                    $project: {
                        _id: 1
                    }
                }
            ])
            let orgIds = organizationIds.map((org) => {
                return org._id
            })
            filters.buyerId = {
                $in: orgIds
            }
        }
        if (filter.productName) {
            let products = await Product.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.productName,
                            $options: "i"
                        }
                    }
                },
                {
                    $project: {
                        _id: 1
                    }
                }
            ])
            let productIds = products.map((product) => {
                return product._id
            })
            filters.singleProduct = {
                productId: {
                    $in: productIds
                }
            }
            let catalogues = await Catalogue.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.productName,
                            $options: "i"
                        }
                    }
                },
                {
                    $project: {
                        _id: 1
                    }
                }
            ])
            let catalogueIds = catalogues.map((catalogue) => {
                return catalogue._id
            })
            filters.catalogueProduct = {
                catalogueId: {
                    $in: catalogueIds
                }
            }
        }
        if (filter.orderId) {
            filters.singleProduct = {
                orderId: filter.orderId
            }
            filters.catalogueProduct = {
                orderId: filter.orderId
            }
        }
    },
    // this is function is not in use i didn't knew the intention of this program so,
    // I'm leaving this here how ever this function takes a lot of time to respond
    // async getAllReturnOrderForAdminsss(data) {
    //     let searchText = {},
    //         page = 1,
    //         limit = 100
    //     if (data.transactionStatus == "ReturnPending") {
    //         searchText = {
    //             transactionStatus: "ReturnPending"
    //         }
    //     } else {
    //         searchText = {}
    //     }

    //     let allPaymentData = await Payment.aggregate([
    //         {
    //             $match: searchText
    //         },
    //         {
    //             $lookup: {
    //                 from: "users",
    //                 localField: "buyerId",
    //                 foreignField: "_id",
    //                 as: "buyerId"
    //             }
    //         },

    //         {
    //             $unwind: {
    //                 path: "$buyerId",
    //                 preserveNullAndEmptyArrays: true
    //             }
    //         },
    //         {
    //             $sort: {
    //                 _id: -1
    //             }
    //         },
    //         {
    //             $facet: {
    //                 paginatedResult: [
    //                     {
    //                         $skip: page * limit - limit
    //                     },
    //                     {
    //                         $limit: limit
    //                     }
    //                 ],
    //                 totalCount: [
    //                     {
    //                         $count: "count"
    //                     }
    //                 ]
    //             }
    //         }
    //     ])
    //     console.log(
    //         "allPaymentData[0].paginatedResult",
    //         allPaymentData[0].paginatedResult
    //     )
    //     for (const singlePaymentProductObj of allPaymentData[0]
    //         .paginatedResult) {
    //         if (
    //             singlePaymentProductObj &&
    //             singlePaymentProductObj.singleProduct &&
    //             singlePaymentProductObj.singleProduct.length &&
    //             singlePaymentProductObj.singleProduct[0] &&
    //             singlePaymentProductObj.singleProduct[0].productId
    //         ) {
    //             singlePaymentProductObj.singleProduct[0].productId =
    //                 await ProductModel.getOneProduct({
    //                     productId:
    //                         singlePaymentProductObj.singleProduct[0].productId
    //                 })
    //         } else {
    //             singlePaymentProductObj.catalogueProduct[0].catalogueId =
    //                 await CatalogueModel.getOneCatalogue({
    //                     catalogueId:
    //                         singlePaymentProductObj.catalogueProduct[0]
    //                             .catalogueId
    //                 })
    //         }

    //         console.log("singlePaymentProductObj", singlePaymentProductObj)
    //         // return singlePaymentProductObj
    //     }
    //     return {
    //         orderData: allPaymentData[0].paginatedResult,
    //         totalCount: allPaymentData[0].totalCount
    //     }
    // },
    async getOneReturnOrder(data) {
        let returnData = await Payment.findById({
            _id: ObjectId(data.returnOrderId)
        })
            .populate({
                path: "catalogueProduct.catalogueId ",
                model: "Catalogue",
                populate: {
                    path: "mainCategory",
                    model: "MainCategory"
                }
                // populate: {
                //     path: "category",
                //     model: "Category"
                // },
                // populate: {
                //     path: "productId",
                //     model: "Product"
                // }
            })
            .populate({
                path: "catalogueProduct.catalogueId",
                model: "Catalogue",
                populate: {
                    path: "category",
                    model: "Category"
                }
            })
            .populate({
                path: "catalogueProduct.products",
                model: "Catalogue",
                populate: {
                    path: "productId",
                    model: "Product"
                }
            })
            .populate({
                path: "catalogueProduct.organizationId",
                model: "Organization"
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "mainCategory",
                    model: "MainCategory"
                }
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "category",
                    model: "Category"
                }
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "organization",
                    model: "Organization"
                }
            })
            .populate({
                path: "singleProduct.productId",
                model: "Product",
                populate: {
                    path: "user",
                    model: "User"
                }
            })
            .populate("buyerId")
            .populate("PaymentId")
        console.log("get one return data", returnData)
        return returnData
    },
    async approvedUnapprovedPendingOrderFromAdmin(data) {
        console.log("approvedUnapprovedPendingOrderFromAdmin", data)
        let queryObj = {},
            updateObj = {},
            queryPreviousObj = {},
            updatePreviousObj = {}
        if (data.orderStatus == "Pending") {
            return "Please Provide Valid Status"
        }
        if (data.orderStatus == "Approved") {
            data.transactionStatus = "Approved"
        } else {
            data.transactionStatus = "Unapproved"
        }
        let findOneOrderData = await Payment.findById({
            _id: ObjectId(data.orderId)
        })
        let adminId = ObjectId("61f92a583c145c00128f86af")
        let logObject = {},
            logs = {
                fromStatus: "ReturnPending",
                toStatus: data.orderStatus,
                date: new Date(),
                user: adminId,
                name: "Admin"
            }
        console.log("findOneOrderData", findOneOrderData)
        if (_.isEmpty(findOneOrderData)) {
            return "No Order Found"
        }
        if (data.singleProductOrderId) {
            queryObj = {
                "singleProduct._id": ObjectId(data.singleProductOrderId)
            }
            updateObj = {
                "singleProduct.$.orderStatus": data.orderStatus,
                transactionStatus: data.transactionStatus
            }
            logObject = {
                "singleProduct.$.logs": logs
            }
        } else {
            queryObj = {
                "catalogueProduct._id": ObjectId(data.catalogueProductOrderId)
            }
            updateObj = {
                "catalogueProduct.$.orderStatus": data.orderStatus,
                transactionStatus: data.transactionStatus
            }
            logObject = {
                "catalogueProduct.$.logs": logs
            }
        }
        if (data.orderStatus == "Unapproved") {
            if (!data.rejectionReason) {
                return "Please Provide Rejection Reason"
            }
            updateObj["rejectionReason"] = data.rejectionReason
            updatePreviousObj["rejectionReason"] = data.rejectionReason
        }

        queryObj["_id"] = ObjectId(data.orderId)

        let updateOneData = await Payment.updateOne(
            queryObj,
            { $set: updateObj, $push: logObject },
            {
                new: true
            }
        )
        console.log("updateOneData", updateOneData)
        // let updateMainPayment = await PaymentModel.updateOnePayment({
        //     orderId: findOneOrderData._id,
        //     transactionStatus: data.transactionStatus
        // })
        if (data.singleProductOrderId) {
            queryPreviousObj = {
                "singleProduct._id": ObjectId(findOneOrderData.returnOrderId)
            }
            updatePreviousObj = {
                "singleProduct.$.orderStatus": data.orderStatus
            }
        } else {
            queryPreviousObj = {
                "catalogueProduct._id": ObjectId(findOneOrderData.returnOrderId)
            }
            updatePreviousObj = {
                "catalogueProduct.$.orderStatus": data.orderStatus
            }
        }
        queryPreviousObj["_id"] = ObjectId(findOneOrderData.returnPaymentId)

        let updatePreviousOrderData = await Payment.updateOne(
            queryPreviousObj,
            { $set: updatePreviousObj, $push: logObject },
            {
                new: true
            }
        )
        console.log("updateMainPayment", updatePreviousOrderData)
        if (updatePreviousOrderData) {
            let productData = {
                catalogueProductOrderId: data.catalogueProductOrderId
            }
            if (data.singleProductOrderId) {
                productData = {
                    singleProductOrderId: data.singleProductOrderId
                }
            }
            InvoiceModel.returnInvoices({
                paymentId: data.orderId,
                productId: productData
            })
            return updateOneData
        } else {
            return "Failed To Update Payment"
        }
    },
    async getAllOrdersForAdmin(data) {
        let queryObj = {},
            searchText = {},
            page = Number(data.page) > 1 ? Number(data.page) : 1,
            limit = Number(data.limit) > 0 ? Number(data.limit) : 10

        let matchPipeline = [
            {
                $match: {
                    returnOrderId: { $exists: false }
                }
            }
        ]
        if (data.filter) {
            console.log(data.filter)
            let filterMatch = await this.getFilterMatch(data.filter)
            if (_.isEmpty(filterMatch)) {
            } else {
                let pipeline = {
                    $match: {
                        $and: filterMatch
                    }
                }
                matchPipeline.push(pipeline)
            }
        }
        // return matchPipeline
        let aggregationPipeline = [
            {
                $sort: {
                    _id: -1
                }
            },
            {
                $skip: page * limit - limit
            },
            {
                $limit: limit
            },
            {
                $unwind: {
                    path: "$singleProduct",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: "$catalogueProduct",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "organizations",
                    localField: "buyerId",
                    foreignField: "user.userId",
                    as: "buyerId"
                }
            },

            {
                $unwind: {
                    path: "$buyerId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "products",
                    localField: "singleProduct.productId",
                    foreignField: "_id",
                    as: "singleProduct.productId"
                }
            },

            {
                $unwind: {
                    path: "$singleProduct.productId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "catalogues",
                    localField: "catalogueProduct.catalogueId",
                    foreignField: "_id",
                    as: "catalogueProduct.catalogueId"
                }
            },

            {
                $unwind: {
                    path: "$catalogueProduct.catalogueId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "organizations",
                    localField: "singleProduct.organizationId",
                    foreignField: "_id",
                    as: "singleProduct.organizationId"
                }
            },

            {
                $unwind: {
                    path: "$singleProduct",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "organizations",
                    localField: "catalogueProduct.organizationId",
                    foreignField: "_id",
                    as: "catalogueProduct.organizationId"
                }
            },

            {
                $unwind: {
                    path: "$catalogueProduct.organizationId",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "singleProduct.productId.category",
                    foreignField: "_id",
                    as: "singleProduct.productId.category"
                }
            },

            {
                $unwind: {
                    path: "$singleProduct.productId.category",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "catalogueProduct.catalogueId.category",
                    foreignField: "_id",
                    as: "catalogueProduct.catalogueId.category"
                }
            },

            {
                $unwind: {
                    path: "$catalogueProduct.catalogueId.category",
                    preserveNullAndEmptyArrays: true
                }
            }
        ]

        let matchPipe = _.cloneDeep(matchPipeline)
        let facetPipe = matchPipe.concat(aggregationPipeline)
        let totalCountPipe = matchPipe.concat([
            {
                $count: "totalCount"
            }
        ])
        let facet = [
            {
                $facet: {
                    paginatedResult: facetPipe,
                    totalCount: totalCountPipe
                }
            }
        ]
        // return facet
        let aggregate = await Payment.aggregate(facet)
        return {
            orderData: aggregate[0].paginatedResult,
            totalCount: aggregate[0].totalCount
        }
    },
    async getFilterMatch(filter) {
        console.log("filter", filter)
        let filters = []
        if (filter.date) {
            let fromDate = new Date(filter.date[0])
            let toDate = new Date(filter.date[1])
            filters.push({
                createdAt: {
                    $gte: fromDate,
                    $lte: toDate
                }
            })
        }
        if (filter.buyerName) {
            let buyerIds = await User.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.buyerName,
                            $options: "i"
                        }
                    }
                }
            ])
            let buyerIdsArray = buyerIds.map((buyer) => {
                return buyer._id
            })
            console.log("buyerIdsArray", buyerIdsArray)
            filters.push({
                buyerId: {
                    $in: buyerIdsArray
                }
            })
        }
        if (filter.companyName) {
            let organizationIds = await Organization.aggregate([
                {
                    $match: {
                        companyName: {
                            $regex: filter.companyName,
                            $options: "i"
                        }
                    }
                }
            ])
            let organizationIdsArray = organizationIds.map((organization) => {
                return organization._id
            })
            let pushObj = {
                $or: [
                    {
                        "singleProduct.organizationId": {
                            $in: organizationIdsArray
                        }
                    },
                    {
                        "catalogueProduct.organizationId": {
                            $in: organizationIdsArray
                        }
                    }
                ]
            }
            filters.push(pushObj)
        }
        if (filter.productName) {
            let productIds = await Product.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.productName,
                            $options: "i"
                        }
                    }
                }
            ])
            let productIdsArray = productIds.map((product) => {
                return product._id
            })
            let catalogueProductIds = await Catalogue.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.productName,
                            $options: "i"
                        }
                    }
                }
            ])
            let catalogueIdArray = catalogueProductIds.map((product) => {
                return product._id
            })
            let pushObj = {
                $or: [
                    {
                        "singleProduct.productId": {
                            $in: productIdsArray
                        }
                    },
                    {
                        "catalogueProduct.catalogueId": {
                            $in: catalogueIdArray
                        }
                    }
                ]
            }
            filters.push(pushObj)
        }
        if (filter.categoryName) {
            let categoryIds = await Category.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.categoryName,
                            $options: "i"
                        }
                    }
                }
            ])
            let categoryIdsArray = categoryIds.map((category) => {
                return category._id
            })
            let pushObj = {
                $or: [
                    {
                        "singleProduct.productId.category": {
                            $in: categoryIdsArray
                        }
                    },
                    {
                        "catalogueProduct.catalogueId.category": {
                            $in: categoryIdsArray
                        }
                    }
                ]
            }
            filters.push(pushObj)
        }
        if (filter.productType) {
            let mainCategoryIds = await MainCategory.aggregate([
                {
                    $match: {
                        name: {
                            $regex: filter.productType,
                            $options: "i"
                        }
                    }
                }
            ])
            let mainCategoryIdsArray = mainCategoryIds.map((category) => {
                return category._id
            })
            filters.push({
                "singleProduct.productId.mainCategory": {
                    $in: mainCategoryIdsArray
                }
            })
        }
        return filters
    },
    async changeStatus(data) {
        let transactionStatus,
            logObject = {},
            updateObject = {},
            paymentQueryObject = {}
        // finding if the payment and user exists or not
        let [findOneOrderData, userObject] = await Promise.all([
            Payment.findById({
                _id: ObjectId(data.orderId)
            }),
            User.findById({ _id: ObjectId(data.userId) })
        ])
        if (!findOneOrderData || !userObject) {
            return {
                status: 404,
                message: "Order not found",
                data: {}
            }
        }
        // setting all the logs to push in the log array
        if (data.orderStatus == "Cancelled") {
            transactionStatus = findOneOrderData.transactionStatus
            logObject = {
                fromStatus: "Pending",
                toStatus: data.orderStatus,
                date: new Date(),
                reason: data.cancelReason,
                user: ObjectId(data.userId),
                name: userObject.name
            }
        } else if (data.orderStatus == "ReturnShipping") {
            transactionStatus = "ReturnShipping"
            logObject = {
                fromStatus: "Approved",
                toStatus: data.orderStatus,
                date: new Date(),
                user: ObjectId(data.userId),
                name: userObject.name
            }
        } else if (data.orderStatus == "ReturnDelivered") {
            transactionStatus = "ReturnDelivered"
            logObject = {
                fromStatus: "ReturnShipping",
                toStatus: data.orderStatus,
                date: new Date(),
                user: ObjectId(data.userId),
                name: userObject.name
            }
        }
        if (!transactionStatus) {
            return {
                status: 404,
                message: "Invalid Order Status",
                data: {}
            }
        }
        // setting query for update
        // setting the update object
        let logs = {}
        if (data.catalogueProductOrderId) {
            paymentQueryObject = {
                "catalogueProduct._id": ObjectId(data.catalogueProductOrderId)
            }
            updateObject = {
                transactionStatus,
                "catalogueProduct.$.orderStatus": data.orderStatus
            }
            if ((data.orderStatus = "Cancelled")) {
                updateObject["catalogueProduct.$.cancelReason"] =
                    data.cancelReason
            }
            logs = {
                "catalogueProduct.$.logs": logObject
            }
        } else {
            paymentQueryObject = {
                "singleProduct._id": ObjectId(data.singleProductOrderId)
            }
            updateObject = {
                transactionStatus,
                "singleProduct.$.orderStatus": data.orderStatus
            }
            if (data.orderStatus == "Cancelled") {
                updateObject["singleProduct.$.cancelReason"] = data.cancelReason
            }
            logs = {
                "singleProduct.$.logs": logObject
            }
            if (data.orderStatus == "ReturnShipping") {
                updateObject["courierCompanyName"] = data.courierCompanyName
                updateObject["trackingId"] = data.trackingId
            }
        }
        paymentQueryObject["_id"] = ObjectId(data.orderId)
        let updateResult = await Payment.updateOne(
            paymentQueryObject,
            {
                $set: updateObject,
                $push: logs
            },
            {
                new: true
            }
        )
        if (updateResult.nModified == 0) {
            return {
                status: 400,
                message: "Unable to update Order",
                data: {}
            }
        }
        if (data.orderStatus != "Cancelled") {
            data.name = userObject.name
            PaymentModel.updatePaymentForReturn(data, findOneOrderData)
        }
        return {
            status: 200,
            message: "Order updated successfully",
            data: {}
        }
    },
    async updatePaymentForReturn(data, findOneOrderData) {
        let queryObject = {},
            updateObject = {},
            logObject = {},
            logs = {
                toStatus: data.orderStatus,
                date: new Date(),
                name: data.name
            }
        if (data.orderStatus == "ReturnDelivered") {
            logObject.fromStatus = "ReturnShipping"
        } else {
            logObject.fromStatus = "Approved"
        }
        if (data.catalogueProductOrderId) {
            queryObject["catalogueProduct._id"] = findOneOrderData.returnOrderId
            updateObject["catalogueProduct.$.orderStatus"] = data.orderStatus
            logObject["catalogueProduct.$.logs"] = logs
        } else {
            queryObject["singleProduct._id"] = findOneOrderData.returnOrderId
            updateObject["singleProduct.$.orderStatus"] = data.orderStatus
            logObject["singleProduct.$.logs"] = logs
        }

        let update = await Payment.updateOne(
            queryObject,
            {
                $set: updateObject,
                $push: logObject
            },
            {
                new: true
            }
        )
        return update
    },
    async changeStatuses(data) {
        console.log("Change Status", data)
        let queryObj = {},
            updateObj = {},
            queryPreviousObj = {},
            updatePreviousObj = {},
            updateLogObject = {
                fromStatus: "Null",
                toStatus: data.orderStatus,
                date: Date.now(),
                reason: data.cancelReason,
                user: ObjectId(data.userId)
            }
        if (data.orderStatus == "ReturnShipping") {
            data.transactionStatus = "ReturnShipping"
            updateObj["courierCompanyName"] = data.courierCompanyName
            updateObj["trackingId"] = data.trackingId
        } else if (data.orderStatus == "ReturnDelivered") {
            data.transactionStatus = "ReturnDelivered"
        }
        let [findOneOrderData, userObject] = await Promise.all([
            Payment.findById({
                _id: ObjectId(data.orderId)
            }),
            User.findById({ _id: ObjectId(data.userId) })
        ])

        if (data.orderStatus == "Cancelled") {
            data.transactionStatus = findOneOrderData.transactionStatus
        }
        console.log("findOneOrderData", findOneOrderData)
        if (_.isEmpty(findOneOrderData)) {
            return "No Order Found"
        }
        if (data.singleProductOrderId) {
            queryObj = {
                "singleProduct._id": ObjectId(data.singleProductOrderId)
            }
            updateObj = {
                "singleProduct.$.orderStatus": data.orderStatus,
                transactionStatus: data.transactionStatus
            }
            if (data.orderStatus == "Cancelled") {
                updateObj["singleProduct.$.cancelReason"] = data.cancelReason
                updateObj["singleProduct.$.logs"] = updateLogObject
            }
        } else {
            queryObj = {
                "catalogueProduct._id": ObjectId(data.catalogueProductOrderId)
            }
            updateObj = {
                "catalogueProduct.$.orderStatus": data.orderStatus,
                transactionStatus: data.transactionStatus
            }
            if (data.orderStatus == "Cancelled") {
                updateObj["catalogueProduct.$.cancelReason"] = data.cancelReason
                updateObj["catalogueProduct.$.logs"] = updateLogObject
            }
        }
        if (data.orderStatus == "ReturnShipping") {
            updateObj["courierCompanyName"] = data.courierCompanyName
            updateObj["trackingId"] = data.trackingId
        }
        queryObj["_id"] = ObjectId(data.orderId)

        let updateOneData = await Payment.updateOne(queryObj, updateObj, {
            new: true
        })
        console.log("updateOneData", updateOneData)
        // let updateMainPayment = await PaymentModel.updateOnePayment({
        //     orderId: findOneOrderData._id,
        //     transactionStatus: data.transactionStatus
        // })
        if (data.orderStatus == "ReturnDelivered") {
            // creating return invoices at this stage
            let productId
            if (data.singleProductOrderId) {
                productId = {
                    singleProductOrderId: data.singleProductOrderId
                }
            } else {
                productId = {
                    catalogueProductOrderId: data.catalogueProductOrderId
                }
            }
            // return InvoiceModel.returnInvoices({
            //     paymentId: data.orderId,
            //     productId: productId,
            //     userId: data.userId
            // })
        }
        if (data.orderStatus != "Cancelled") {
            if (data.singleProductOrderId) {
                queryPreviousObj = {
                    "singleProduct._id": ObjectId(
                        findOneOrderData.returnOrderId
                    )
                }
                updatePreviousObj = {
                    "singleProduct.$.orderStatus": data.orderStatus
                }
            } else {
                queryPreviousObj = {
                    "catalogueProduct._id": ObjectId(
                        findOneOrderData.returnOrderId
                    )
                }
                updatePreviousObj = {
                    "catalogueProduct.$.orderStatus": data.orderStatus
                }
            }
            queryPreviousObj["_id"] = ObjectId(findOneOrderData.returnPaymentId)

            let updatePreviousOrderData = await Payment.updateOne(
                queryPreviousObj,
                updatePreviousObj,
                {
                    new: true
                }
            )
            console.log("updateMainPayment", updatePreviousOrderData)
            if (updatePreviousOrderData && updatePreviousOrderData.nModified) {
                if (data.orderStatus == "ReturnDelivered") {
                    let sendObj = {}
                    sendObj = {
                        buyerId: findOneOrderData.buyerId,
                        returnPaymentId: findOneOrderData.returnPaymentId,
                        returnOrderId: findOneOrderData.returnOrderId
                    }
                    if (
                        findOneOrderData &&
                        findOneOrderData.singleProduct &&
                        findOneOrderData.singleProduct.length &&
                        findOneOrderData.singleProduct[0]
                    ) {
                        sendObj["sellerId"] =
                            findOneOrderData.singleProduct[0].sellerId
                        sendObj["organizationId"] =
                            findOneOrderData.singleProduct[0].organizationId
                        sendObj["orderId"] =
                            findOneOrderData.singleProduct[0]._id
                        sendObj["productId"] =
                            findOneOrderData.singleProduct[0].productId
                    } else {
                        sendObj["sellerId"] =
                            findOneOrderData.catalogueProduct[0].sellerId
                        sendObj["organizationId"] =
                            findOneOrderData.catalogueProduct[0].organizationId
                        sendObj["orderId"] =
                            findOneOrderData.catalogueProduct[0]._id
                        sendObj["catalogueId"] =
                            findOneOrderData.catalogueProduct[0].catalogueId
                    }
                    await InvoiceModel.returnInvoice(sendObj)
                    return updateOneData
                } else {
                    return updateOneData
                }
            } else {
                return "Failed To Update Payment"
            }
        }
        // Triggering an emailer when a payment is cancelled
        if (data.orderStatus == "Cancelled") {
            PaymentModel.cancelMailer(queryObj, data.userId)
        }
    },
    async cancelMailer(queryObj, userId) {
        let paymentData = await Payment.findOne(queryObj)
        let subUserData = await User.findById(userId)
        console.log("PaymentData", paymentData)
        console.log("This is UserID", subUserData)
        let finalData = {}
        if (paymentData.singleProduct) {
            for (let product of paymentData.singleProduct) {
                if (product.id == queryObj["singleProduct._id"]) {
                    finalData = product
                }
            }
        }
        if (paymentData.catalogueProduct) {
            for (let product of paymentData.catalogueProduct) {
                if (product.id == queryObj["catalogueProduct._id"]) {
                    finalData = product
                }
            }
        }
        console.log("THIS IS FINAL DATA", finalData)
        // let userOrg = await Organization.find({'user.userId': paymentData.buyerId})
        // console.log("User Org", userOrg)
        let userObj = await User.findById(paymentData.buyerId)
        console.log("USER OBJ", userObj)
        let productObject = finalData.catalogueId
            ? await Catalogue.findById(finalData.catalogueId).populate(
                  "mainCategory organization user"
              )
            : await Product.findById(finalData.productId).populate(
                  "mainCategory organization user"
              )

        let orderedDate = paymentData.createdAt.toUTCString().substring(5, 16)
        let cancellationData = paymentData.updatedAt
            .toUTCString()
            .substring(5, 16)

        let manufacturerMailData = {
            email: productObject.organization.email,
            orderId: finalData.orderId,
            mainCategory: productObject.mainCategory.name,
            type: productObject.user.type,
            manufacturerName: subUserData.name,
            dateOfCancellation: cancellationData,
            dateOfOrder: orderedDate,
            refundAmount: paymentData.grossTotal,
            displayImage: finalData.catalogueId
                ? productObject.catalogueImage
                : productObject.displayImage[0].image
        }
        let buyerMailData = {
            email: userObj.email,
            orderId: finalData.orderId,
            productName: productObject.name,
            manufacturerName: subUserData.name,
            dateOfOrder: orderedDate,
            mainCategory: productObject.mainCategory.name,
            refundAmount: paymentData.grossTotal,
            displayImage: finalData.catalogueId
                ? productObject.catalogueImage
                : productObject.displayImage[0].image
        }
        console.log("manufacturer Data", manufacturerMailData)
        console.log("Buyer Mail Data", buyerMailData)
        PaymentModel.cancelMailManufacturer(manufacturerMailData)
        PaymentModel.cancelMailBuyer(buyerMailData)
    },
    async cancelMailManufacturer(data) {
        let subject = "You Cancelled An Order"
        let emails = await ejs.renderFile("./views/" + "/cancelled-order.ejs", {
            url: imageUrl,
            orderId: data.orderId,
            type: data.type,
            manufacturerName: data.manufacturerName,
            dateOfCancellation: data.dateOfCancellation,
            dateOfOrder: data.dateOfOrder,
            mainCategory: data.mainCategory,
            refundAmount: data.refundAmount,
            displayImage: data.displayImage
        })
        let email = data.email
        let outputData = UserModel.sendEmail({
            email: email,
            ejsFile: emails,
            subject: subject
        })

        return outputData
    },
    async cancelMailBuyer(data) {
        let subject = "You Order Has Been Cancelled"
        let emails = await ejs.renderFile(
            "./views/" + "cancelled-order-buyer.ejs",
            {
                url: imageUrl,
                orderId: data.orderId,
                dateOfOrder: data.dateOfOrder,
                prodName: data.productName,
                mainCategory: data.mainCategory,
                refundAmount: data.refundAmount,
                displayImage: data.displayImage
            }
        )
        let email = data.email
        let outputData = UserModel.sendEmail({
            email: email,
            ejsFile: emails,
            subject: subject
        })

        return outputData
    },
    async orderReviewFromBuyer(data) {
        let queryObj = {},
            updateObj = {}

        if (data.singleProductOrderId) {
            queryObj = {
                "singleProduct._id": ObjectId(data.singleProductOrderId)
            }
            updateObj = {
                "singleProduct.$.productQuality": data.productQuality
            }
        } else {
            queryObj = {
                "catalogueProduct._id": ObjectId(data.catalogueProductOrderId)
            }
            updateObj = {
                "catalogueProduct.$.productQuality": data.productQuality
            }
        }
        queryObj["_id"] = ObjectId(data.orderId)

        let updateOneData = await Payment.updateOne(queryObj, updateObj, {
            new: true
        })
        console.log("updateOneData", updateOneData)
        return updateOneData
    },
    async getAllOrderForAccessLevelWiseForAdmin(data) {
        let searchText = {},
            page = parseInt(data.page) > 1 ? parseInt(data.page) : 1,
            limit = parseInt(data.limit) > 0 ? parseInt(data.limit) : 10,
            sendData = [],
            match1 = {},
            match2 = {}
        if (data.organizationId) {
            sendData = [
                {
                    "singleProduct.organizationId": ObjectId(
                        data.organizationId
                    )
                },
                {
                    "catalogueProduct.organizationId": ObjectId(
                        data.organizationId
                    )
                }
            ]
            match1 = {
                "singleProduct.organizationId": ObjectId(data.organizationId)
            }
            match2 = {
                "catalogueProduct.organizationId": ObjectId(data.organizationId)
            }
            searchText = {
                returnOrderId: {
                    $exists: false
                },
                returnPaymentId: {
                    $exists: false
                },
                $or: sendData
            }
        } else if (data.buyerId) {
            searchText["buyerId"] = ObjectId(data.buyerId)
            searchText["returnOrderId"] = {
                $exists: false
            }
            searchText["returnPaymentId"] = {
                $exists: false
            }
        } else if (data.agentId) {
            sendData = [
                {
                    "singleProduct.agentId": ObjectId(data.agentId)
                },
                {
                    "catalogueProduct.agentId": ObjectId(data.agentId)
                }
            ]
            match1 = {
                "singleProduct.agentId": ObjectId(data.agentId)
            }
            match2 = {
                "catalogueProduct.agentId": ObjectId(data.agentId)
            }
            searchText = {
                returnOrderId: {
                    $exists: false
                },
                returnPaymentId: {
                    $exists: false
                },
                $or: sendData
            }
        }

        let queryObj = {
            searchText,
            match1,
            match2,
            page,
            limit
        }
        return await PaymentModel.commonApiForAllOrders(queryObj)
    },
    // calculate a products total amount and
    // @Input: [{productDetails}, {}, ...]
    /* product: {
            totalWeight,
            chargesOfSuratDreams,
            quantity,
            gst,
            organizationId,
            productId || catalogueId,
            productSelected, (in case of catalogue & color set)
            price,
            size,
            scenario, [sellAll, ignoreDesign, ignoreSize, ignoreColor]
            product: {} (incase of single piece)
        }
    */
    // @Return: {totalAmount, totalGst, totalShippingCharges}
    async calculateProductCalculations(productDetails) {
        let totalAmount = 0
        let totalWeight = 0
        let totalGst = 0
        let totalShippingCharges = 0
        let totalDiscountedPrice = 0
        for (let product of productDetails) {
            // if the product is a catalogue product
            if (product.catalogueId && !product.productId) {
                const [catalogue] = await Promise.all([
                    Catalogue.findById(product.catalogueId)
                ])
                let quantity = product.quantity

                if (product.scenario == "sellAll") {
                    let discountedPrice = 0,
                        gst = 0

                    if (
                        product.catalogueId &&
                        product.catalogueId.discount &&
                        product.catalogueId.discount != 0
                    ) {
                        discountedPrice = PaymentModel.calculateDiscount(
                            +product.catalogueId.discount,
                            +catalogue.price
                        )
                        totalDiscountedPrice += discountedPrice
                    } else if (
                        catalogue &&
                        catalogue.discount &&
                        catalogue.discount != 0
                    ) {
                        discountedPrice = PaymentModel.calculateDiscount(
                            catalogue.discount,
                            +catalogue.price
                        )
                        totalDiscountedPrice += discountedPrice
                    }
                    if (discountedPrice == 0) {
                        gst = PaymentModel.calculateGst(
                            +catalogue.price,
                            +catalogue.gst
                        )
                    } else {
                        gst = PaymentModel.calculateGst(
                            discountedPrice,
                            +catalogue.gst
                        )
                    }
                    totalGst = totalGst + gst
                    totalAmount = totalAmount + +catalogue.price
                    totalWeight = totalWeight + +catalogue.weight
                    let shippingCharges = PaymentModel.calculateShippingCharges(
                        quantity,
                        catalogue.weight
                    )
                    totalShippingCharges =
                        totalShippingCharges + shippingCharges
                } else if (
                    product.scenario == "ignoreDesign" ||
                    product.scenario == "ignoreSize"
                ) {
                    // ignore design or size code here
                    let totalData = await PaymentModel.calculateTotalCatalogue(
                        quantity,
                        product.productSelected,
                        catalogue
                    )
                    totalAmount = totalAmount + totalData.amount
                    totalWeight = totalWeight + totalData.weight
                    totalShippingCharges =
                        totalShippingCharges + totalData.shippingCharge
                    totalGst = totalGst + totalData.gst
                    totalDiscountedPrice =
                        totalDiscountedPrice + totalData.discountedPrice
                }
            }
            // if the product is single piece
            if (!product.catalogueId && product.productId) {
                let totalData = await PaymentModel.calculateTotalSingle(product)

                totalAmount = totalAmount + totalData.totalAmount
                totalWeight = totalWeight + totalData.totalWeight
                totalShippingCharges =
                    totalShippingCharges + totalData.totalShippingCharges
                totalGst = totalGst + totalData.totalGst
                totalDiscountedPrice =
                    totalDiscountedPrice + totalData.totalDiscountedPrice
            } else if (
                product.catalogueId &&
                product.productId &&
                !product.catalogueId._id
            ) {
                // this data request comes from cart on a single piece
                let totalData = await PaymentModel.calculateTotalSingle(product)

                totalAmount = totalAmount + totalData.totalAmount
                totalWeight = totalWeight + totalData.totalWeight
                totalShippingCharges =
                    totalShippingCharges + totalData.totalShippingCharges
                totalGst = totalGst + totalData.totalGst
                totalDiscountedPrice =
                    totalDiscountedPrice + totalData.totalDiscountedPrice
            }
        }
        return {
            totalGst,
            totalAmount,
            totalWeight,
            totalShippingCharges,
            totalDiscountedPrice
        }
    },
    /* 
        a function for calculating a catalogue products total amount
        @Input (quantity, data, catalogue)
        data {
            pricePerPiece: Number,
            selected: Boolean,
            sizes: []
        }
        catalogue {
            weight: Number
        }
        @Output {amount, weight, shippingCharge, gst}
    */
    async calculateTotalCatalogue(quantity, data, catalogue) {
        let totalDesigns = 0
        let discountedPrice = 0
        let amount = 0
        let weight = 0
        for (let select of data) {
            if (select.selected) {
                totalDesigns++
                let single = await Product.findById(select._id)
                let totalSize = 0,
                    size = 0
                if (select.size == "") {
                    totalSize = 1
                    size = ["1"]
                } else {
                    size = MyCartModel.getSelectedSize(select.size)
                    totalSize += size.length
                }
                amount = amount + totalSize * select.pricePerPiece
                weight = weight + size.length * single.weight
            }
        }
        if (quantity > 1) {
            amount = amount * quantity
        }
        if (catalogue && catalogue.discount && catalogue.discount != 0) {
            discountedPrice = PaymentModel.calculateDiscount(
                catalogue.discount,
                amount
            )
        } else if (data && data.discount && data.discount != 0) {
            discountedPrice = PaymentModel.calculateDiscount(
                data.discount,
                amount
            )
        }
        let shippingCharge = PaymentModel.calculateShippingCharges(
            quantity,
            weight
        )
        let gst = 0
        if (discountedPrice == 0) {
            gst = PaymentModel.calculateGst(amount, +catalogue.gst)
        } else {
            gst = PaymentModel.calculateGst(discountedPrice, +catalogue.gst)
        }
        return {
            amount,
            weight,
            shippingCharge,
            gst,
            discountedPrice
        }
    },
    async calculateTotalSingle(product) {
        let totalAmount = 0
        let totalWeight = 0
        let totalGst = 0
        let totalShippingCharges = 0
        let totalDiscountedPrice = 0
        const [singlePiece] = await Promise.all([
            Product.findById(product.productId)
        ])
        let quantity = +product.quantity
        // Sell All Scenario for single piece
        if (
            !singlePiece.sellScenario ||
            singlePiece.sellScenario == "sellAll"
        ) {
            var totalSizes = 0
            if (_.isEmpty(product.size)) {
                totalSizes = 1
            } else {
                totalSizes = product.size.length
            }
            let amount = totalSizes * singlePiece.pricePerPiece
            let weight = totalSizes * singlePiece.weight
            if (singlePiece.discount && singlePiece.discount != 0) {
                let discountedPrice = PaymentModel.calculateDiscount(
                    singlePiece.discount,
                    amount
                )
                totalDiscountedPrice = totalDiscountedPrice + discountedPrice
                let gst = PaymentModel.calculateGst(
                    discountedPrice,
                    +singlePiece.gst
                )
                totalGst = totalGst + gst
            } else {
                let gst = PaymentModel.calculateGst(amount, +singlePiece.gst)
                totalGst = totalGst + gst
            }
            totalAmount = totalAmount + amount
            totalWeight = totalWeight + weight
            let shippingCharge = PaymentModel.calculateShippingCharges(
                quantity,
                weight
            )
            totalShippingCharges = totalShippingCharges + shippingCharge
        }
        // ignore size scenario for single piece
        else if (singlePiece.sellScenario == "ignoreSize") {
            let totalSizes = 0
            for (let select of product.size) {
                if (select.selected) {
                    totalSizes = totalSizes + 1
                }
            }
            let amount = totalSizes * singlePiece.pricePerPiece
            let weight = totalSizes * singlePiece.weight
            if (singlePiece.discount != 0) {
                let discountedPrice = PaymentModel.calculateDiscount(
                    singlePiece.discount,
                    amount
                )
                totalDiscountedPrice = totalDiscountedPrice + discountedPrice
                let gst = PaymentModel.calculateGst(
                    discountedPrice,
                    +singlePiece.gst
                )
                totalGst = totalGst + gst
            } else {
                let gst = PaymentModel.calculateGst(amount, +singlePiece.gst)
                totalGst = totalGst + gst
            }
            totalAmount = totalAmount + amount
            totalWeight = totalWeight + weight
            let shippingCharge = PaymentModel.calculateShippingCharges(
                quantity,
                weight
            )
            totalShippingCharges = totalShippingCharges + shippingCharge
        }
        if (quantity > 1) {
            totalAmount = totalAmount * quantity
            totalWeight = totalWeight * quantity
            totalGst = totalGst * quantity
            totalShippingCharges = totalShippingCharges * quantity
            totalDiscountedPrice = totalDiscountedPrice * quantity
        }
        return {
            totalGst,
            totalAmount,
            totalWeight,
            totalShippingCharges,
            totalDiscountedPrice
        }
    },
    // this function calculates gst% totalAmount
    // @Params: amount: int, gst: int
    // @Return: totalGst: int
    calculateGst(amount, gst) {
        return _.round((amount * gst) / 100, 2)
    },
    // for every 100gm shipping charges 10RS
    // @Input: weight, totalProducts
    // @Return: Total Shipping Charges
    calculateShippingCharges(quantity, weight) {
        return _.round(weight * 0.1, 2)
    },
    /*
        @Input: (discount%, totalAmount)
        @Return Discounted Price
    */
    calculateDiscount(discount, amount) {
        return amount - _.round((discount * amount) / 100, 2)
    },

    async buyerOrderCount(buyerId, cart) {
        let match = {}
        if (!cart) {
            match = {
                $or: [
                    {
                        "AllProducts.buyerReadStatus": false
                    },
                    {
                        "AllProducts.buyerReadStatus": {
                            $exists: false
                        }
                    }
                ]
            }
        }
        let orderCount = await Payment.aggregate([
            {
                $match: {
                    buyerOrganizationId: ObjectId(buyerId)
                }
            },
            {
                $set: {
                    AllProducts: {
                        $concatArrays: ["$singleProduct", "$catalogueProduct"]
                    }
                }
            },
            {
                $unwind: "$AllProducts"
            },
            {
                $match: {
                    "AllProducts.orderStatus": {
                        $in: [
                            "Pending",
                            "Shipping",
                            "InTransport",
                            "PaymentFailed"
                        ]
                    },
                    ...match
                }
            },
            {
                $group: {
                    _id: null,
                    count: {
                        $sum: 1
                    }
                }
            }
        ])

        let returnObject = {}
        if (orderCount && orderCount.length > 0) {
            returnObject.Pending = orderCount[0].count
        } else {
            returnObject.Pending = 0
        }

        return { status: 200, message: "Success", result: returnObject }
    },

    async manufacturerOrderCount(organizationId, cart) {
        let match = {}
        if (!cart) {
            match = {
                $or: [
                    {
                        "AllProducts.manufacturerReadStatus": false
                    },
                    {
                        "AllProducts.manufacturerReadStatus": {
                            $exists: false
                        }
                    }
                ]
            }
        }
        let orderCount = await Payment.aggregate([
            {
                $set: {
                    AllProducts: {
                        $concatArrays: ["$singleProduct", "$catalogueProduct"]
                    }
                }
            },
            {
                $unwind: "$AllProducts"
            },
            {
                $match: {
                    "AllProducts.organizationId": ObjectId(organizationId),
                    "AllProducts.orderStatus": {
                        $in: [
                            "Pending",
                            "Shipping",
                            "InTransport",
                            "PaymentFailed"
                        ]
                    },
                    ...match
                }
            },
            {
                $group: {
                    _id: null,
                    count: {
                        $sum: 1
                    }
                }
            }
        ])

        let returnObject = {}
        if (orderCount && orderCount.length > 0) {
            returnObject.Pending = orderCount[0].count
        } else {
            returnObject.Pending = 0
        }

        return { status: 200, message: "Success", result: returnObject }
    },
    /**
     *
     * @param {String} buyerOrganizationId
     * @returns {object} return
     * @description This function is used to update the buyerReadStatus/manufacturerReadStatus in all the orders
     *
     */
    async markOrderAsRead(data) {
        try {
            let queryObject, updateObject
            if (data.userType == "Buyer") {
                queryObject = {
                    buyerOrganizationId: ObjectId(data.organizationId)
                }
                updateObject = {
                    $set: {
                        "singleProduct.$[].buyerReadStatus": true,
                        "catalogueProduct.$[].buyerReadStatus": true
                    }
                }
            } else {
                queryObject = {
                    $or: [
                        {
                            "singleProduct.organizationId": ObjectId(
                                data.organizationId
                            )
                        },
                        {
                            "catalogueProduct.organizationId": ObjectId(
                                data.organizationId
                            )
                        }
                    ]
                }
                updateObject = {
                    $set: {
                        "singleProduct.$[].manufacturerReadStatus": true,
                        "catalogueProduct.$[].manufacturerReadStatus": true
                    }
                }
            }
            let update = await Payment.updateMany(queryObject, updateObject, {
                new: true
            })
            return { status: 200, data: {}, message: "Successfully updated!" }
        } catch (error) {
            console.log("error", error)
            return { status: 500, data: {}, message: "Internal Server Error" }
        }
    },
    async getCartShippingCharges(data) {
        let user = await User.find({ _id: data[0].buyerId })
        let manuList = []
        let manuShippingData = []
        let shippingAmount = 0
        await Promise.all(
            data.map(async (value) => {
                let index
                if (Object.keys(value.product).length != 0) {
                    index = manuList.indexOf(
                        value.product.organization._id.toString()
                    )
                } else {
                    index = manuList.indexOf(
                        value.catalogueId.organization._id.toString()
                    )
                }
                if (index != -1) {
                    if (Object.keys(value.product).length != 0) {
                        manuShippingData[index].packaging_unit_details.push({
                            units: value.quantity,
                            length: 11,
                            height: 11,
                            width: 11,
                            unit: "cm",
                            weight: value.product.weight / 1000
                        })
                        manuShippingData[index].quantity += value.quantity
                    } else {
                        manuShippingData[index].packaging_unit_details.push({
                            units: value.quantity,
                            length: 11,
                            height: 11,
                            width: 11,
                            unit: "cm",
                            weight: value.catalogueId.weight / 1000
                        })
                        manuShippingData[index].quantity += value.quantity
                    }
                } else {
                    let shippingData = {
                        to_pincode: user[0].zipcode,
                        to_city: user[0].city,
                        to_state: user[0].state,
                        quantity: value.quantity,
                        invoice_value: value.price,
                        packaging_unit_details: [
                            {
                                units: value.quantity,
                                length: 11,
                                height: 11,
                                width: 11,
                                unit: "cm"
                            }
                        ]
                    }
                    if (Object.keys(value.product).length != 0) {
                        manuList.push(value.product.organization._id.toString())
                        shippingData.packaging_unit_details[0].weight =
                            value.product.weight / 1000
                        shippingData.from_pincode =
                            value.product.organization.zipcode
                        shippingData.from_city = value.product.organization.city
                        shippingData.from_state =
                            value.product.organization.state
                    } else {
                        manuList.push(
                            value.catalogueId.organization._id.toString()
                        )
                        shippingData.packaging_unit_details[0].weight =
                            value.catalogueId.weight
                        shippingData.from_pincode =
                            value.catalogueId.organization.zipcode
                        shippingData.from_city =
                            value.catalogueId.organization.city
                        shippingData.from_state =
                            value.catalogueId.organization.state
                    }
                    manuShippingData.push(shippingData)
                }
            })
        )
        manuShippingData.map((value) => (shippingAmount += 500))
        // uncomment this when you want the shipping rates
        // await Promise.all(
        //     manuShippingData.map(async (value) => {
        //         let shipData = await ShipRocketModel.getShippingRate(value)
        //         shippingAmount += shipData.shippingCharge
        //     })
        // )
    },
    /**
     *
     * @param {object} data required data for creating a shipment order
     * @params {string} data.paymentId
     * @params {string} data.pickupDataTime
     * @params {string} data.paymentType
     * @returns {object} return
     * @description This function is used to create a shipment order
     */
    async creatingShippingOrder(data) {
        try {
            let paymentData, order, queryObject, setObject
            if (data.paymentType == "SinglePiece") {
                paymentData = await Payment.findOne({
                    "singleProduct._id": ObjectId(data.paymentId)
                })
                order = paymentData.singleProduct.filter((single) => {
                    return single._id == data.paymentId
                })[0]
            } else {
                paymentData = await Payment.findOne({
                    "catalogueProduct._id": ObjectId(data.paymentId)
                })
                order = paymentData.catalogueProduct.filter((single) => {
                    return single._id == data.paymentId
                })[0]
            }
            let shippingOrders = await PaymentModel.shippingOrders(
                order,
                data.pickupDataTime
            )
            // let shipmentOrder = await ShipRocketModel.createShippingOrder(
            //     shippingOrders
            // )
            // let shipmentOrderId = shipmentOrder.id
            // change this whenever you want proper shipping!
            let shipmentOrderId = "IBXTOYCAT"
            order.shippingDetails.shippingOrderId = shipmentOrderId
            order.shippingDetails.approxWeight = shippingOrders.approx_weight
            order.shippingDetails.noOfUnit = shippingOrders.no_of_units
            order.shippingDetails.invoiceValue = shippingOrders.invoice_value
            // let shipmentAndPickupId =
            //     await PaymentModel.createShippingAndPickup(
            //         order.shippingDetails,
            //         data.pickupDataTime
            //     )
            let shipmentAndPickupId = {
                shipmentId: "DJIIUAGBSYKJBCAHSBDUBVAS"
            }
            if (data.paymentType == "SinglePiece") {
                queryObject = {
                    "singleProduct._id": ObjectId(data.paymentId)
                }
                setObject = {
                    $set: {
                        "singleProduct.$.shippingDetails.shippingOrderId":
                            shipmentOrderId,
                        "singleProduct.$.shippingDetails.approxWeight":
                            shippingOrders.approx_weight,
                        "singleProduct.$.shippingDetails.noOfUnit":
                            shippingOrders.no_of_unit,
                        "singleProduct.$.shippingDetails.invoiceValue":
                            shippingOrders.invoice_value,
                        "singleProduct.$.shippingDetails.shipmentId":
                            shipmentAndPickupId.shipmentId
                        // "singleProduct.$.shippingDetails.pickupId":
                        //     shipmentAndPickupId.pickupId
                    }
                }
            } else {
                queryObject = {
                    "catalogueProduct._id": ObjectId(data.paymentId)
                }
                setObject = {
                    $set: {
                        "catalogueProduct.$.shippingDetails.shippingOrderId":
                            shipmentOrderId,
                        "catalogueProduct.$.shippingDetails.approxWeight":
                            shippingOrders.approx_weight,
                        "catalogueProduct.$.shippingDetails.noOfUnit":
                            shippingOrders.no_of_units,
                        "catalogueProduct.$.shippingDetails.invoiceValue":
                            shippingOrders.invoice_value,
                        "catalogueProduct.$.shippingDetails.shipmentId":
                            shipmentAndPickupId.shipmentId
                        // "catalogueProduct.$.shippingDetails.pickupId":
                        //     shipmentAndPickupId.pickupId
                    }
                }
            }
            // save the orderid and other details to further use the data!!!
            await Payment.updateOne(queryObject, setObject, { new: true })

            return {
                status: 200,
                data: shippingOrders,
                message: "Success"
            }
        } catch (error) {
            throw new Error(error)
        }
    },
    async shippingOrders(data, pickupDataTime) {
        return new Promise(async (resolve, reject) => {
            try {
                let shippingDetails = data.shippingDetails
                let orderRequestData = {
                    from_warehouse_id: shippingDetails.fromWarehouseId,
                    sender_contact_person_name: shippingDetails.senderName,
                    sender_contact_person_contact_no:
                        shippingDetails.senderContact,
                    sender_contact_person_email: shippingDetails.senderEmail,
                    pickup_date_time: new Date(pickupDataTime),
                    approx_weight: 0,
                    no_of_units: 0,
                    packaging_unit_details: shippingDetails.packageDetails,
                    invoice_value: 0,
                    to_warehouse_id: shippingDetails.toWarehouseId,
                    recipient_contact_person_name:
                        shippingDetails.recipientName,
                    recipient_contact_person_contact_no:
                        shippingDetails.recipientContact,
                    recipient_contact_person_email:
                        shippingDetails.recipientEmail,
                    invoice_number: shippingDetails._id
                }
                orderRequestData.invoice_value += data.grossTotal
                let noOfSizes = 1
                if (data.size) {
                    noOfSizes = data.size.filter((val) => val.selected).length
                }
                if (data.products && data.products.length > 0) {
                    noOfSizes = 0
                    data.products.map((val) => {
                        if (!val.selected) return null
                        noOfSizes += val.size.filter(
                            (val) => val.selected
                        ).length
                    })
                }
                if (noOfSizes == 0) {
                    noOfSizes = 1
                }
                orderRequestData["no_of_units"] += data.quantity * noOfSizes
                orderRequestData["approx_weight"] +=
                    (data.totalWeight * noOfSizes) / 1000
                // orderRequestData["packaging_unit_details"].push({
                //     units: data.quantity * noOfSizes,
                //     length: 11,
                //     height: 12,
                //     width: 11,
                //     unit: "cm",
                //     weight: (
                //         (data.totalWeight * noOfSizes) /
                //         1000
                //     ).toFixed(2)
                // })
                orderRequestData["invoice_value"] =
                    orderRequestData["invoice_value"].toFixed(2)
                orderRequestData["approx_weight"] =
                    orderRequestData["approx_weight"].toFixed(2)
                resolve(orderRequestData)
            } catch (error) {
                reject(error)
            }
        })
    },
    /**
     * @param {object} data required data for creating a shipment order
     * @params {object} shippingDetails
     * @params {String} pickupDataTime
     * @params {String} paymentType
     * @returns {object} return
     * @description This function is used to create an order's shipment
     */
    async createShippingAndPickup(shippingDetails, pickupDataTime) {
        try {
            console.log("shippingDetails", shippingDetails)
            let shipmentOrderData = {
                mode_id: shippingDetails.modeId,
                delivery_partner_id: shippingDetails.deliveryPartnerId,
                from_warehouse_id: shippingDetails.fromWarehouseId,
                sender_contact_person_name: shippingDetails.senderName,
                sender_contact_person_contact_no: shippingDetails.senderContact,
                sender_contact_person_email: shippingDetails.senderEmail,
                pickup_date_time: new Date(pickupDataTime),
                approx_weight: shippingDetails.approxWeight,
                packaging_unit_details: shippingDetails.packageDetails,
                //[Array of packaging unit details containning units, length, height, width, weight, unit]
                invoice_value: shippingDetails.invoiceValue,
                remarks: "true",
                to_warehouse_id: shippingDetails.toWarehouseId,
                recipient_contact_person_name: shippingDetails.recipientName,
                recipient_contact_person_email: shippingDetails.recipientEmail,
                recipient_contact_person_contact_no:
                    shippingDetails.recipientContact,
                no_of_units: shippingDetails.noOfUnit,
                invoice_number: shippingDetails._id,
                order_id: shippingDetails.shippingOrderId
            }
            // let createShipment = await ShipRocketModel.createShipment(
            //     shipmentOrderData
            // )
            // let pickupData = {
            //     mode_id: shippingDetails.modeId,
            //     delivery_partner_id: shippingDetails.deliveryPartnerId,
            //     from_warehouse_id: shippingDetails.fromWarehouseId,
            //     order_id: shippingDetails.shippingOrderId,
            //     person_name: shippingDetails.senderName,
            //     phone: shippingDetails.senderContact,
            //     email: shippingDetails.senderEmail,
            //     pickup_date_time: new Date(pickupDataTime),
            //     weight: shippingDetails.approxWeight,
            //     remarks: "true",
            //     no_of_units: shippingDetails.noOfUnit
            // }
            // let createPickup = await ShipRocketModel.createPickup(pickupData)
            return {
                shipmentId: "LOAOBDJKWJQ"
                // shipmentId: createShipment.id
                // pickupId: createPickup.id
            }
        } catch (error) {
            throw new Error(error)
        }
    }
}
